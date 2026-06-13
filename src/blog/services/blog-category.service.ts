import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { BlogCategory } from '../entities/blog-category.entity';
import { slugify } from './blog-slug.util';
import { TranslationsService } from '../../translations/translations.service';
import { Translation } from '../../translations/translation.entity';
import { ET_BLOG_CATEGORY } from '../../common/entity-types';

// ── DTOs ──────────────────────────────────────────────────────────────────────

const CategoryTranslationsSchema = z
  .object({
    en: z.object({ name: z.string().min(1).max(300) }).optional(),
    fr: z.object({ name: z.string().min(1).max(300) }).optional(),
  })
  .refine((t) => t.en?.name || t.fr?.name, {
    message: 'At least one language name is required',
  });

export const CreateCategorySchema = z.object({
  slug:         z.string().min(1).max(300).optional(),
  color:        z.string().length(7).regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  description:  z.string().nullish(),
  sortOrder:    z.number().int().min(0).optional(),
  isActive:     z.boolean().optional(),
  translations: CategoryTranslationsSchema,
});

export const UpdateCategorySchema = z.object({
  slug:         z.string().min(1).max(300).optional(),
  color:        z.string().length(7).regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  description:  z.string().nullish(),
  sortOrder:    z.number().int().min(0).optional(),
  isActive:     z.boolean().optional(),
  translations: CategoryTranslationsSchema.optional(),
});

export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildLocaleMap(rows: Translation[]): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    if (!map[row.lang]) map[row.lang] = {};
    map[row.lang][row.field] = row.value;
  }
  return map;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class BlogCategoryService {
  constructor(
    @InjectRepository(BlogCategory)
    private readonly repo: Repository<BlogCategory>,
    private readonly translationsService: TranslationsService,
  ) {}

  // ── Read ────────────────────────────────────────────────────────────────────

  async findAll(activeOnly = false, lang?: string): Promise<any[]> {
    const cats = await this.repo.find({
      where: activeOnly ? { isActive: true } : {},
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    if (!cats.length) return cats;

    const enriched = await this.attachTranslations(cats);

    if (lang) {
      // Public endpoint: return flat name in the requested language
      return enriched.map((cat) => ({
        id:      cat.id,
        slug:    cat.slug,
        color:   cat.color,
        isActive: cat.isActive,
        sortOrder: cat.sortOrder,
        name:    (cat.translations as any)[lang]?.name ?? cat.name,
      }));
    }

    return enriched; // Admin: full translations map
  }

  async findOne(id: string): Promise<any> {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    const [enriched] = await this.attachTranslations([cat]);
    return enriched;
  }

  async findBySlug(slug: string): Promise<BlogCategory | null> {
    return this.repo.findOne({ where: { slug } });
  }

  // ── Write ────────────────────────────────────────────────────────────────────

  async create(dto: CreateCategoryDto): Promise<any> {
    // FR is canonical; fall back to EN if FR is absent
    const canonicalName = dto.translations.fr?.name ?? dto.translations.en?.name ?? '';
    const slug          = dto.slug ?? slugify(canonicalName);

    const existing = await this.repo.findOne({ where: { slug } });
    if (existing) throw new ConflictException(`Slug "${slug}" already exists`);

    const cat = this.repo.create({
      slug,
      name:        canonicalName,
      color:       dto.color       ?? null,
      description: dto.description ?? null,
      sortOrder:   dto.sortOrder   ?? 0,
      isActive:    dto.isActive    ?? true,
    });
    const saved = await this.repo.save(cat);

    await this.upsertTranslations(saved.id, dto.translations);

    const [enriched] = await this.attachTranslations([saved]);
    return enriched;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<any> {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);

    if (dto.slug && dto.slug !== cat.slug) {
      const conflict = await this.repo.findOne({ where: { slug: dto.slug } });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`Slug "${dto.slug}" already exists`);
      }
      cat.slug = dto.slug;
    }

    if (dto.translations) {
      const canonicalName = dto.translations.fr?.name ?? dto.translations.en?.name;
      if (canonicalName) cat.name = canonicalName;
      await this.upsertTranslations(id, dto.translations);
    }

    if (dto.color       !== undefined) cat.color       = dto.color       ?? null;
    if (dto.description !== undefined) cat.description = dto.description ?? null;
    if (dto.sortOrder   !== undefined) cat.sortOrder   = dto.sortOrder;
    if (dto.isActive    !== undefined) cat.isActive    = dto.isActive;

    const saved = await this.repo.save(cat);
    const [enriched] = await this.attachTranslations([saved]);
    return enriched;
  }

  async remove(id: string): Promise<void> {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    await this.translationsService.deleteForEntity(ET_BLOG_CATEGORY, id);
    await this.repo.delete(id);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async upsertTranslations(
    categoryId: string,
    translations: { en?: { name: string }; fr?: { name: string } },
  ): Promise<void> {
    const items: Array<{
      entityType: string; entityId: string; field: string; lang: string; value: string;
    }> = [];

    for (const lang of ['en', 'fr'] as const) {
      const name = translations[lang]?.name;
      if (name) {
        items.push({ entityType: ET_BLOG_CATEGORY, entityId: categoryId, field: 'name', lang, value: name });
      }
    }

    if (items.length) await this.translationsService.bulkUpsert({ items });
  }

  /** Attach `translations` object to each category for admin responses. */
  private async attachTranslations(cats: BlogCategory[]): Promise<any[]> {
    const ids  = cats.map((c) => c.id);
    const rows = await this.translationsService.findForEntities(ET_BLOG_CATEGORY, ids);

    return cats.map((cat) => {
      const catRows = rows.filter((r) => r.entityId === cat.id);
      const map     = buildLocaleMap(catRows);

      // Seed FR fallback from entity's canonical `name` column if no translation exists yet
      if (!map['fr']) map['fr'] = {};
      if (!map['fr']['name']) map['fr']['name'] = cat.name;

      return { ...cat, translations: map };
    });
  }
}
