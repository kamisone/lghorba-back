import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { GcsService } from '../gcs/gcs.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { MediaAsset } from './media-asset.entity';
import { MediaFolder } from './media-folder.entity';
import { MediaUsage, MediaEntityType } from './media-usage.entity';

export interface MediaListOptions {
  search?:    string;
  mimeType?:  string;
  tag?:       string;
  folderId?:  string | null; // undefined = all, null/string = filter by folder
  folderSet?: boolean;       // true when folderId was explicitly provided (even as null)
  limit?:     number;
  offset?:    number;
}

export interface TrackUsageDto {
  entityType: MediaEntityType;
  entityId:   string;
  field:      string;
}

const MEDIA_PREFIX       = 'media/';
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'];
const MAX_FILE_BYTES     = 20 * 1024 * 1024; // 20 MB

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(MediaAsset)  private readonly assetRepo:  Repository<MediaAsset>,
    @InjectRepository(MediaFolder) private readonly folderRepo: Repository<MediaFolder>,
    @InjectRepository(MediaUsage)  private readonly usageRepo:  Repository<MediaUsage>,
    private readonly gcs:  GcsService,
    private readonly urls: AssetUrlService,
  ) {}

  // ── Upload ────────────────────────────────────────────────────────────────

  async upload(
    file: Express.Multer.File,
    altText?: string,
    uploadedBy?: string,
    folderId?: string | null,
  ): Promise<MediaAsset & { url: string }> {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new Error(`Unsupported file type: ${file.mimetype}`);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
    }

    const checksum = crypto.createHash('sha256').update(new Uint8Array(file.buffer)).digest('hex');

    // Dedup: return existing asset (move to requested folder if specified)
    const existing = await this.assetRepo.findOne({ where: { checksum } });
    if (existing) {
      if (folderId !== undefined && existing.folderId !== folderId) {
        await this.assetRepo.update(existing.id, { folderId: folderId ?? null });
        existing.folderId = folderId ?? null;
      }
      const url = await this.urls.resolve(existing.storageKey);
      return { ...existing, url };
    }

    const ext        = file.originalname.split('.').pop()?.toLowerCase() ?? 'bin';
    const datePart   = new Date().toISOString().slice(0, 7);
    const storageKey = `${MEDIA_PREFIX}${datePart}/${checksum.slice(0, 8)}-${Date.now()}.${ext}`;

    await this.gcs.upload(file.buffer, storageKey, file.mimetype, 'publicRead');

    const { width, height } = await extractImageDimensions(file.buffer, file.mimetype);

    const resolvedFolderId = folderId !== undefined ? (folderId ?? null) : null;

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
      folderId:         resolvedFolderId,
      tags:             [],
    });
    await this.assetRepo.save(asset);

    const url = await this.urls.resolve(storageKey);
    return { ...asset, url };
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async list(opts: MediaListOptions = {}): Promise<{ items: Array<MediaAsset & { url: string; usageCount: number }>; total: number }> {
    const { search, mimeType, tag, folderId, folderSet, limit = 48, offset = 0 } = opts;

    const qb = this.assetRepo
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (search)   qb.andWhere('a.originalFilename ILIKE :q', { q: `%${search}%` });
    if (mimeType) qb.andWhere('a.mimeType = :mimeType',      { mimeType });
    if (tag)      qb.andWhere(':tag = ANY(a.tags)',           { tag });

    if (folderSet) {
      if (folderId === null || folderId === '') {
        qb.andWhere('a."folder_id" IS NULL');
      } else {
        qb.andWhere('a."folder_id" = :folderId', { folderId });
      }
    }

    const [assets, total] = await qb.getManyAndCount();

    const urlMap = await this.urls.resolveBatch(assets.map(a => a.storageKey));

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

    return {
      items: assets.map(a => ({ ...a, url: urlMap.get(a.storageKey) ?? '', usageCount: countMap.get(a.id) ?? 0 })),
      total,
    };
  }

  // ── Single ────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<MediaAsset & { url: string }> {
    const asset = await this.assetRepo.findOneBy({ id });
    if (!asset) throw new NotFoundException('Media asset not found');
    const url = await this.urls.resolve(asset.storageKey);
    return { ...asset, url };
  }

  // ── Update metadata ───────────────────────────────────────────────────────

  async updateMetadata(
    id: string,
    dto: { altText?: string; tags?: string[]; folderId?: string | null },
  ): Promise<MediaAsset & { url: string }> {
    const asset = await this.assetRepo.findOneBy({ id });
    if (!asset) throw new NotFoundException('Media asset not found');

    if (dto.altText   !== undefined) asset.altText  = dto.altText;
    if (dto.tags      !== undefined) asset.tags     = dto.tags;
    if ('folderId' in dto)           asset.folderId = dto.folderId ?? null;
    await this.assetRepo.save(asset);

    const url = await this.urls.resolve(asset.storageKey);
    return { ...asset, url };
  }

  // ── Bulk move ─────────────────────────────────────────────────────────────

  async moveAssets(assetIds: string[], folderId: string | null): Promise<void> {
    if (!assetIds.length) return;
    const placeholders = assetIds.map((_, i) => `$${i + 2}`).join(', ');
    await this.assetRepo.manager.query(
      `UPDATE "media_assets" SET "folder_id" = $1 WHERE "id" IN (${placeholders})`,
      [folderId, ...assetIds],
    );
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async delete(id: string): Promise<void> {
    const asset = await this.assetRepo.findOneBy({ id });
    if (!asset) throw new NotFoundException('Media asset not found');

    const usageCount = await this.usageRepo.count({ where: { assetId: id } });
    if (usageCount > 0) {
      throw new ConflictException(
        `Asset is referenced by ${usageCount} usage record(s) and cannot be deleted. Remove all references first.`,
      );
    }

    const refs = await this.assetRepo.manager.query<{ cnt: string }[]>(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT 1 FROM shop_products           WHERE "featuredImageKey" = $1 AND "deletedAt" IS NULL
        UNION ALL
        SELECT 1 FROM shop_products           WHERE $1 = ANY("galleryImageKeys") AND "deletedAt" IS NULL
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
    await this.assetRepo.remove(asset);
  }

  // ── Folders ───────────────────────────────────────────────────────────────

  async listFolders(): Promise<Array<MediaFolder & { assetCount: number }>> {
    const folders = await this.folderRepo.find({ order: { name: 'ASC' } });
    if (!folders.length) return [];

    const counts = await this.assetRepo
      .createQueryBuilder('a')
      .select('a."folder_id"', 'folderId')
      .addSelect('COUNT(a.id)', 'count')
      .where('a."folder_id" IS NOT NULL')
      .groupBy('a."folder_id"')
      .getRawMany<{ folderId: string; count: string }>();

    const countMap = new Map(counts.map(r => [r.folderId, parseInt(r.count, 10)]));
    return folders.map(f => ({ ...f, assetCount: countMap.get(f.id) ?? 0 }));
  }

  async createFolder(name: string, parentId?: string | null): Promise<MediaFolder & { assetCount: number }> {
    if (parentId) {
      const parent = await this.folderRepo.findOneBy({ id: parentId });
      if (!parent) throw new NotFoundException('Parent folder not found');
    }
    const folder = await this.folderRepo.save(
      this.folderRepo.create({ name: name.trim(), parentId: parentId ?? null }),
    );
    return { ...folder, assetCount: 0 };
  }

  async renameFolder(id: string, name: string): Promise<MediaFolder & { assetCount: number }> {
    const folder = await this.folderRepo.findOneBy({ id });
    if (!folder) throw new NotFoundException('Folder not found');
    folder.name = name.trim();
    await this.folderRepo.save(folder);
    const [all] = await this.listFolders().then(list => [list.find(f => f.id === id)]);
    return all ?? { ...folder, assetCount: 0 };
  }

  async deleteFolder(id: string): Promise<void> {
    const folder = await this.folderRepo.findOneBy({ id });
    if (!folder) throw new NotFoundException('Folder not found');

    const parentId = folder.parentId;
    // Move direct assets to parent (or root)
    await this.assetRepo.manager.query(
      `UPDATE "media_assets" SET "folder_id" = $1 WHERE "folder_id" = $2`,
      [parentId, id],
    );
    // Move direct subfolders to parent (or root)
    await this.folderRepo.manager.query(
      `UPDATE "media_folders" SET "parent_id" = $1 WHERE "parent_id" = $2`,
      [parentId, id],
    );

    await this.folderRepo.remove(folder);
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

  async syncEntityUsages(
    entityType: MediaEntityType,
    entityId:   string,
    storageKeys: Array<{ key: string; field: string }>,
  ): Promise<void> {
    await this.usageRepo.delete({ entityType, entityId });
    if (!storageKeys.length) return;

    const uniqueKeys = [...new Set(storageKeys.map(s => s.key))];
    const assets = await this.assetRepo.find({ where: uniqueKeys.map(k => ({ storageKey: k })) });
    const keyToId = new Map(assets.map(a => [a.storageKey, a.id]));

    const records = storageKeys
      .filter(({ key }) => keyToId.has(key))
      .map(({ key, field }) => this.usageRepo.create({ assetId: keyToId.get(key)!, entityType, entityId, field }));

    if (records.length) await this.usageRepo.save(records);
  }
}

// ── Dimension extraction ──────────────────────────────────────────────────────

async function extractImageDimensions(buf: Buffer, mime: string): Promise<{ width: number | null; height: number | null }> {
  try {
    if (mime === 'image/png') {
      if (buf.length >= 24) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    } else if (mime === 'image/jpeg') {
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
      if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        const chunk = buf.toString('ascii', 12, 16);
        if (chunk === 'VP8 ' && buf.length >= 30) {
          return { width: (buf[26] | (buf[27] << 8)) & 0x3FFF, height: (buf[28] | (buf[29] << 8)) & 0x3FFF };
        } else if (chunk === 'VP8L' && buf.length >= 25) {
          const bits = buf.readUInt32LE(21);
          return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
        }
      }
    }
  } catch { /* Non-fatal */ }
  return { width: null, height: null };
}
