import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GcsService } from '../../gcs/gcs.service';
import { GeoIpService } from '../behavior/geo-ip.service';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';
import { deviceFromUserAgent } from '../../common/utils/device.util';
import { platformFromSource } from '../../common/utils/platform.util';
import { ReplaySession } from '../entities/replay-session.entity';
import { ReplaySessionChunk } from '../entities/replay-session-chunk.entity';
import { ReplayEvent } from '../entities/replay-event.entity';
import { Product } from '../entities/product.entity';
import {
  MAX_BATCH_BYTES,
  MAX_BATCH_EVENTS,
  MAX_SESSION_EVENTS,
  REPLAY_GCS_PREFIX,
} from './replay.constants';
import {
  computeDurationMs,
  containsLikelySensitiveData,
  sanitizeMarkers,
  sanitizePageTitle,
  sanitizePageUrl,
  sanitizeViewport,
} from './replay.util';

export interface StartSessionInput {
  productId: string;
  cartToken?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  clientIp: string | null;
  userAgent: string | null;
  referrer?: string | null;
  utmSource?: string | null;
}

export interface IngestBatchInput {
  sessionId: string;
  /** Raw rrweb events — opaque to this service, stored verbatim as a GCS chunk. */
  events: unknown[];
  /** Lightweight marker rows (click/scroll/navigation) — validated and stored in Postgres. */
  markers?: unknown[];
}

@Injectable()
export class ReplayTrackingService {
  private readonly logger = new Logger(ReplayTrackingService.name);

  constructor(
    @InjectRepository(ReplaySession) private readonly sessionRepo: Repository<ReplaySession>,
    @InjectRepository(ReplaySessionChunk) private readonly chunkRepo: Repository<ReplaySessionChunk>,
    @InjectRepository(ReplayEvent) private readonly eventRepo: Repository<ReplayEvent>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    private readonly gcs: GcsService,
    private readonly geoIp: GeoIpService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /**
   * Starts a session, or returns null when the visitor shouldn't be recorded
   * — an excluded staff IP, a bot User-Agent, or (defense-in-depth) a
   * productId that isn't actually a test product. Null is a silent no-op
   * for the caller (see controller): the recorder never starts, no error is
   * surfaced, matching the existing behavior-tracking exclusion philosophy.
   */
  async startSession(input: StartSessionInput): Promise<{ id: string } | null> {
    if (this.platformSettings.isAnalyticsExcluded(input.clientIp)) return null;
    if (this.platformSettings.isBotUserAgent(input.userAgent)) return null;

    // Server-side enforcement of the test-product-only scope — never trust
    // the client's own page-context check. A cheap existence lookup, not
    // ProductService.findById (which resolves media/story/variant URLs this
    // check doesn't need).
    const isTestProduct = await this.productRepo.exists({
      where: { id: input.productId, isTestProduct: true },
    });
    if (!isTestProduct) return null;

    const now = new Date();
    const session = this.sessionRepo.create({
      productId: input.productId,
      cartToken: input.cartToken ?? null,
      visitorHash: this.geoIp.visitorHashFromIp(input.clientIp),
      clientIp: input.clientIp,
      countryCode: this.geoIp.countryFromIp(input.clientIp),
      device: deviceFromUserAgent(input.userAgent),
      source: platformFromSource(input.referrer, input.utmSource),
      viewportWidth: sanitizeViewport(input.viewportWidth),
      viewportHeight: sanitizeViewport(input.viewportHeight),
      pageUrl: sanitizePageUrl(input.pageUrl),
      pageTitle: sanitizePageTitle(input.pageTitle),
      status: 'active',
      startedAt: now,
      lastEventAt: now,
    });
    const saved = await this.sessionRepo.save(session);
    return { id: saved.id };
  }

  /**
   * Appends one batch of raw rrweb events (as a new GCS chunk) plus any
   * marker rows. Silently no-ops — never throws to the caller — on an
   * unknown/foreign/non-active session, an oversized batch, a session that
   * hit MAX_SESSION_EVENTS, or a payload that trips the sensitive-data
   * backstop: this is a public, unauthenticated, fire-and-forget endpoint,
   * so every failure mode is "drop this batch", not a 4xx/5xx the recorder
   * would need to handle or retry.
   */
  async ingestBatch(input: IngestBatchInput): Promise<void> {
    try {
      if (!Array.isArray(input.events) || input.events.length === 0) return;
      if (input.events.length > MAX_BATCH_EVENTS) {
        this.logger.warn(`Rejected replay batch — ${input.events.length} events exceeds the per-batch cap`);
        return;
      }

      const session = await this.sessionRepo.findOneBy({ id: input.sessionId });
      if (!session || session.status !== 'active') return;
      if (session.eventCount >= MAX_SESSION_EVENTS) return;

      const json = JSON.stringify(input.events);
      const sizeBytes = Buffer.byteLength(json, 'utf8');
      if (sizeBytes > MAX_BATCH_BYTES) {
        this.logger.warn(`Rejected replay batch — ${sizeBytes} bytes exceeds the per-batch cap`);
        return;
      }
      if (containsLikelySensitiveData(json)) {
        this.logger.warn(
          `Rejected replay batch for session ${session.id} — payload matched the sensitive-data backstop`,
        );
        return;
      }

      const sequence = session.chunkCount;
      const objectKey = `${REPLAY_GCS_PREFIX}/${session.id}/${String(sequence).padStart(5, '0')}.json`;
      await this.gcs.upload(Buffer.from(json, 'utf8'), objectKey, 'application/json', 'private');
      await this.chunkRepo.save(
        this.chunkRepo.create({
          sessionId: session.id,
          sequence,
          gcsObjectKey: objectKey,
          sizeBytes,
          eventCount: input.events.length,
        }),
      );

      const markers = sanitizeMarkers(input.markers);
      if (markers.length) {
        await this.eventRepo.save(
          markers.map((m) =>
            this.eventRepo.create({
              sessionId: session.id,
              type: m.type,
              timestampMs: m.timestampMs,
              label: m.label ?? null,
              meta: m.meta ?? null,
            }),
          ),
        );
      }

      const clickDelta = markers.filter((m) => m.type === 'click').length;
      const scrollPcts = markers
        .filter((m) => m.type === 'scroll' && typeof m.meta?.scrollPct === 'number')
        .map((m) => m.meta!.scrollPct as number);
      const batchMaxScroll = scrollPcts.length ? Math.max(...scrollPcts) : 0;

      await this.sessionRepo.update(session.id, {
        eventCount: session.eventCount + input.events.length,
        chunkCount: session.chunkCount + 1,
        clickCount: session.clickCount + clickDelta,
        maxScrollPct: Math.max(session.maxScrollPct, batchMaxScroll),
        lastEventAt: new Date(),
      });
    } catch (err) {
      this.logger.error(`Failed to ingest replay batch: ${(err as Error).message}`);
    }
  }

  /** Marks a session ended — called on page unload via navigator.sendBeacon. */
  async endSession(sessionId: string, markers?: unknown[]): Promise<void> {
    try {
      const session = await this.sessionRepo.findOneBy({ id: sessionId });
      if (!session || session.status !== 'active') return;

      if (markers?.length) {
        const sanitized = sanitizeMarkers(markers);
        if (sanitized.length) {
          await this.eventRepo.save(
            sanitized.map((m) =>
              this.eventRepo.create({
                sessionId: session.id,
                type: m.type,
                timestampMs: m.timestampMs,
                label: m.label ?? null,
                meta: m.meta ?? null,
              }),
            ),
          );
        }
      }

      const endedAt = new Date();
      await this.sessionRepo.update(session.id, {
        status: 'ended',
        endedAt,
        durationMs: computeDurationMs(session.startedAt, endedAt),
        lastEventAt: endedAt,
      });
    } catch (err) {
      this.logger.error(`Failed to end replay session ${sessionId}: ${(err as Error).message}`);
    }
  }
}
