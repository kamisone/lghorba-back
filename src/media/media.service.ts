import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { GcsService } from '../gcs/gcs.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { MediaAsset } from './media-asset.entity';
import { MediaUsage, MediaEntityType } from './media-usage.entity';

export interface MediaListOptions {
  search?:   string;
  mimeType?: string;
  tag?:      string;
  limit?:    number;
  offset?:   number;
}

export interface TrackUsageDto {
  entityType: MediaEntityType;
  entityId:   string;
  field:      string;
}

const MEDIA_PREFIX        = 'media/';
const ALLOWED_MIME_TYPES  = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'];
const MAX_FILE_BYTES      = 20 * 1024 * 1024; // 20 MB

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(MediaAsset) private readonly assetRepo: Repository<MediaAsset>,
    @InjectRepository(MediaUsage) private readonly usageRepo: Repository<MediaUsage>,
    private readonly gcs:   GcsService,
    private readonly urls:  AssetUrlService,
  ) {}

  // ── Upload ────────────────────────────────────────────────────────────────

  async upload(file: Express.Multer.File, altText?: string, uploadedBy?: string): Promise<MediaAsset & { url: string }> {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new Error(`Unsupported file type: ${file.mimetype}`);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
    }

    const checksum = crypto.createHash('sha256').update(new Uint8Array(file.buffer)).digest('hex');

    // Dedup: return existing asset with same checksum
    const existing = await this.assetRepo.findOne({ where: { checksum } });
    if (existing) {
      const url = await this.urls.resolve(existing.storageKey);
      return { ...existing, url };
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? 'bin';
    const datePart = new Date().toISOString().slice(0, 7); // "2024-01"
    const storageKey = `${MEDIA_PREFIX}${datePart}/${checksum.slice(0, 8)}-${Date.now()}.${ext}`;

    await this.gcs.upload(file.buffer, storageKey, file.mimetype);

    const { width, height } = await extractImageDimensions(file.buffer, file.mimetype);

    const asset = this.assetRepo.create({
      storageKey,
      originalFilename: file.originalname,
      mimeType:         file.mimetype,
      sizeBytes:        file.size,
      width,
      height,
      altText:          altText ?? null,
      checksum,
      uploadedBy:       uploadedBy ?? null,
      tags:             [],
    });
    await this.assetRepo.save(asset);

    const url = await this.urls.resolve(storageKey);
    return { ...asset, url };
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async list(opts: MediaListOptions = {}): Promise<{ items: Array<MediaAsset & { url: string; usageCount: number }>; total: number }> {
    const { search, mimeType, tag, limit = 48, offset = 0 } = opts;

    const qb = this.assetRepo
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (search)   qb.andWhere('a.originalFilename ILIKE :q',     { q: `%${search}%` });
    if (mimeType) qb.andWhere('a.mimeType = :mimeType',          { mimeType });
    if (tag)      qb.andWhere(':tag = ANY(a.tags)',               { tag });

    const [assets, total] = await qb.getManyAndCount();

    // Resolve signed URLs in one batch
    const urlMap = await this.urls.resolveBatch(assets.map(a => a.storageKey));

    // Resolve usage counts
    const ids = assets.map(a => a.id);
    const usageCounts = ids.length
      ? await this.usageRepo
          .createQueryBuilder('u')
          .select('u.assetId', 'assetId')
          .addSelect('COUNT(u.id)', 'cnt')
          .where('u.assetId IN (:...ids)', { ids })
          .groupBy('u.assetId')
          .getRawMany()
      : [];
    const countMap = new Map(usageCounts.map(r => [r.assetId as string, parseInt(r.cnt, 10)]));

    const items = assets.map(a => ({
      ...a,
      url:        urlMap.get(a.storageKey) ?? '',
      usageCount: countMap.get(a.id) ?? 0,
    }));

    return { items, total };
  }

  // ── Single ────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<MediaAsset & { url: string }> {
    const asset = await this.assetRepo.findOneBy({ id });
    if (!asset) throw new NotFoundException('Media asset not found');
    const url = await this.urls.resolve(asset.storageKey);
    return { ...asset, url };
  }

  // ── Update metadata ───────────────────────────────────────────────────────

  async updateMetadata(id: string, dto: { altText?: string; tags?: string[] }): Promise<MediaAsset & { url: string }> {
    const asset = await this.assetRepo.findOneBy({ id });
    if (!asset) throw new NotFoundException('Media asset not found');

    if (dto.altText !== undefined) asset.altText = dto.altText;
    if (dto.tags    !== undefined) asset.tags    = dto.tags;
    await this.assetRepo.save(asset);

    const url = await this.urls.resolve(asset.storageKey);
    return { ...asset, url };
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const asset = await this.assetRepo.findOneBy({ id });
    if (!asset) throw new NotFoundException('Media asset not found');

    // Refuse deletion if the usage table has active references
    const usageCount = await this.usageRepo.count({ where: { assetId: id } });
    if (usageCount > 0) {
      throw new ConflictException(
        `Asset is referenced by ${usageCount} usage record(s) and cannot be deleted. Remove all references first.`,
      );
    }

    // Belt-and-suspenders: also check raw key columns in commerce tables
    // (catches legacy uploads that pre-date the usage tracking system)
    const refs = await this.assetRepo.manager.query<{ cnt: string }[]>(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT 1 FROM shop_products          WHERE "featuredImageKey" = $1 AND "deletedAt" IS NULL
        UNION ALL
        SELECT 1 FROM shop_products          WHERE $1 = ANY("galleryImageKeys") AND "deletedAt" IS NULL
        UNION ALL
        SELECT 1 FROM shop_product_categories WHERE "imageKey" = $1
        UNION ALL
        SELECT 1 FROM shop_collections        WHERE "imageKey" = $1
        UNION ALL
        SELECT 1 FROM shop_vendors            WHERE "logoKey"  = $1
        UNION ALL
        SELECT 1 FROM shop_payment_types      WHERE "iconKey"  = $1
      ) refs
    `, [asset.storageKey]);
    if (parseInt(refs[0].cnt, 10) > 0) {
      throw new ConflictException(
        'Asset is referenced by commerce entities and cannot be deleted. Remove all references first.',
      );
    }

    await this.gcs.delete(asset.storageKey);
    await this.urls.invalidate(asset.storageKey);
    await this.assetRepo.remove(asset); // cascades usages
  }

  // ── Usage tracking ────────────────────────────────────────────────────────

  async trackUsage(assetId: string, dto: TrackUsageDto): Promise<MediaUsage> {
    const existing = await this.usageRepo.findOne({
      where: { assetId, entityType: dto.entityType, entityId: dto.entityId, field: dto.field },
    });
    if (existing) return existing;

    const usage = this.usageRepo.create({ assetId, ...dto });
    return this.usageRepo.save(usage);
  }

  async removeUsage(assetId: string, entityType: MediaEntityType, entityId: string, field: string): Promise<void> {
    await this.usageRepo.delete({ assetId, entityType, entityId, field });
  }

  async getUsage(assetId: string): Promise<MediaUsage[]> {
    return this.usageRepo.find({ where: { assetId }, order: { createdAt: 'DESC' } });
  }

  // ── Bulk entity sync ──────────────────────────────────────────────────────
  // Call this from any commerce service when an entity's image keys are saved.
  // Atomically replaces all usage records for the entity so the table stays accurate.

  async syncEntityUsages(
    entityType: MediaEntityType,
    entityId:   string,
    storageKeys: Array<{ key: string; field: string }>,
  ): Promise<void> {
    await this.usageRepo.delete({ entityType, entityId });
    if (!storageKeys.length) return;

    const uniqueKeys = [...new Set(storageKeys.map(s => s.key))];
    const assets = await this.assetRepo.find({
      where: uniqueKeys.map(k => ({ storageKey: k })),
    });
    const keyToId = new Map(assets.map(a => [a.storageKey, a.id]));

    const records = storageKeys
      .filter(({ key }) => keyToId.has(key))
      .map(({ key, field }) => this.usageRepo.create({ assetId: keyToId.get(key)!, entityType, entityId, field }));

    if (records.length) await this.usageRepo.save(records);
  }
}

// ── Dimension extraction ──────────────────────────────────────────────────────
// Light-weight parser — reads image headers without a native dependency.
// Only handles JPEG, PNG, and WebP (the dominant formats). Falls back to null.

async function extractImageDimensions(buf: Buffer, mime: string): Promise<{ width: number | null; height: number | null }> {
  try {
    if (mime === 'image/png') {
      // PNG: width at bytes 16-19, height at 20-23 (big-endian uint32)
      if (buf.length >= 24) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
      }
    } else if (mime === 'image/jpeg') {
      // JPEG: scan SOF0/SOF2 markers for dimensions
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xFF) break;
        const marker = buf[i + 1];
        const len    = buf.readUInt16BE(i + 2);
        if ((marker >= 0xC0 && marker <= 0xC3) || marker === 0xC9 || marker === 0xCA) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    } else if (mime === 'image/webp') {
      // WebP: check "WEBPVP8 " (lossy) or "WEBPVP8L" (lossless)
      if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        const chunk = buf.toString('ascii', 12, 16);
        if (chunk === 'VP8 ' && buf.length >= 30) {
          const w = (buf[26] | (buf[27] << 8)) & 0x3FFF;
          const h = (buf[28] | (buf[29] << 8)) & 0x3FFF;
          return { width: w, height: h };
        } else if (chunk === 'VP8L' && buf.length >= 25) {
          const bits = buf.readUInt32LE(21);
          return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
        }
      }
    }
  } catch {
    // Non-fatal — dimensions are metadata only
  }
  return { width: null, height: null };
}
