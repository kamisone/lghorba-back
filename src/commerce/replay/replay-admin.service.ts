import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GcsService } from '../../gcs/gcs.service';
import { Country } from '../entities/country.entity';
import { ReplaySession } from '../entities/replay-session.entity';
import { ReplaySessionChunk } from '../entities/replay-session-chunk.entity';
import { ReplayEvent } from '../entities/replay-event.entity';
import { DateWindow } from '../analytics/analytics-filters';

export interface ReplaySessionListItem {
  id: string;
  productId: string;
  countryCode: string | null;
  countryName: string | null;
  device: string | null;
  source: string | null;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  eventCount: number;
  clickCount: number;
  maxScrollPct: number;
  pageUrl: string | null;
  clientIp: string | null;
}

@Injectable()
export class ReplayAdminService {
  constructor(
    @InjectRepository(ReplaySession) private readonly sessionRepo: Repository<ReplaySession>,
    @InjectRepository(ReplaySessionChunk) private readonly chunkRepo: Repository<ReplaySessionChunk>,
    @InjectRepository(ReplayEvent) private readonly eventRepo: Repository<ReplayEvent>,
    @InjectRepository(Country) private readonly countryRepo: Repository<Country>,
    private readonly gcs: GcsService,
  ) {}

  /** Sessions for one product's replay list — newest first. */
  async listSessions(
    productId: string,
    window: DateWindow,
    limit = 50,
  ): Promise<ReplaySessionListItem[]> {
    // Guard against TypeORM treating an undefined/empty where-value as "no
    // filter" — a missing productId must never fall through to a
    // cross-product session list.
    if (!productId) return [];
    const sessions = await this.sessionRepo.find({
      where: { productId },
      order: { startedAt: 'DESC' },
      take: limit,
    });
    const inWindow = sessions.filter(
      (s) => s.startedAt >= window.since && s.startedAt < window.until,
    );
    if (!inWindow.length) return [];

    const codes = [...new Set(inWindow.map((s) => s.countryCode).filter((c): c is string => !!c))];
    const countries = codes.length
      ? await this.countryRepo.find({ where: { isoCode: In(codes) }, select: ['isoCode', 'name'] })
      : [];
    const nameMap = new Map(countries.map((c) => [c.isoCode, c.name]));

    return inWindow.map((s) => ({
      id: s.id,
      productId: s.productId,
      countryCode: s.countryCode,
      countryName: s.countryCode ? nameMap.get(s.countryCode) ?? s.countryCode : null,
      device: s.device,
      source: s.source,
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationMs: s.durationMs,
      eventCount: s.eventCount,
      clickCount: s.clickCount,
      maxScrollPct: s.maxScrollPct,
      pageUrl: s.pageUrl,
      clientIp: s.clientIp,
    }));
  }

  /** Session metadata + its timeline markers — no GCS reads, used to render the player shell + event list. */
  async getSessionDetail(sessionId: string): Promise<{
    session: ReplaySession;
    markers: ReplayEvent[];
  }> {
    const session = await this.sessionRepo.findOneBy({ id: sessionId });
    if (!session) throw new NotFoundException('Replay session not found');
    const markers = await this.eventRepo.find({
      where: { sessionId },
      order: { timestampMs: 'ASC' },
    });
    return { session, markers };
  }

  /**
   * Concatenates every chunk's raw rrweb events, in order, for playback.
   * Proxied server-side rather than returning signed GCS URLs for the
   * browser to fetch directly — simpler and correct; a session's chunks are
   * capped (MAX_SESSION_EVENTS) so this stays bounded even for a long
   * recording. Revisit with signed URLs only if that cap is ever raised
   * significantly.
   */
  async getSessionEvents(sessionId: string): Promise<unknown[]> {
    const session = await this.sessionRepo.findOneBy({ id: sessionId });
    if (!session) throw new NotFoundException('Replay session not found');

    const chunks = await this.chunkRepo.find({
      where: { sessionId },
      order: { sequence: 'ASC' },
    });
    if (!chunks.length) return [];

    const buffers = await Promise.all(chunks.map((c) => this.gcs.downloadBuffer(c.gcsObjectKey)));
    const events: unknown[] = [];
    for (const buf of buffers) {
      try {
        const parsed = JSON.parse(buf.toString('utf8'));
        if (Array.isArray(parsed)) events.push(...parsed);
      } catch {
        // A corrupt/partial chunk shouldn't fail the whole replay — the
        // player just has a gap, which the UI's "unavailable" states cover.
      }
    }
    return events;
  }
}
