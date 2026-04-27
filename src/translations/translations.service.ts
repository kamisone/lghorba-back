import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BulkUpsertTranslationDto } from './dto/bulk-upsert-translation.dto';
import { UpsertTranslationDto } from './dto/upsert-translation.dto';
import { Translation } from './translation.entity';

@Injectable()
export class TranslationsService {
  constructor(
    @InjectRepository(Translation)
    private readonly repo: Repository<Translation>,
  ) {}

  async upsert(dto: UpsertTranslationDto): Promise<Translation> {
    await this.repo.upsert(dto, ['entityType', 'entityId', 'field', 'lang']);
    return this.repo.findOne({
      where: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        field: dto.field,
        lang: dto.lang,
      },
    });
  }

  async bulkUpsert(dto: BulkUpsertTranslationDto): Promise<void> {
    await this.repo.upsert(dto.items, ['entityType', 'entityId', 'field', 'lang']);
  }

  findForEntity(
    entityType: string,
    entityId: string,
    lang?: string,
  ): Promise<Translation[]> {
    return this.repo.find({
      where: { entityType, entityId, ...(lang ? { lang } : {}) },
      order: { field: 'ASC', lang: 'ASC' },
    });
  }

  /** Overlay translations onto a single entity object. */
  async applyToEntity<T extends Record<string, unknown>>(
    entity: T,
    entityType: string,
    lang: string,
  ): Promise<T> {
    const rows = await this.findForEntity(entityType, entity['id'] as string, lang);
    if (!rows.length) return entity;
    const overrides = Object.fromEntries(rows.map((r) => [r.field, r.value]));
    return { ...entity, ...overrides };
  }

  /** Overlay translations onto a list of entity objects in a single query. */
  async applyToEntities<T extends Record<string, unknown>>(
    entities: T[],
    entityType: string,
    lang: string,
  ): Promise<T[]> {
    if (!entities.length) return entities;
    const ids = entities.map((e) => e['id'] as string);
    const rows = await this.repo
      .createQueryBuilder('t')
      .where('t.entityType = :entityType', { entityType })
      .andWhere('t.entityId IN (:...ids)', { ids })
      .andWhere('t.lang = :lang', { lang })
      .getMany();

    const map = new Map<string, Record<string, string>>();
    for (const row of rows) {
      if (!map.has(row.entityId)) map.set(row.entityId, {});
      map.get(row.entityId)[row.field] = row.value;
    }

    return entities.map((entity) => {
      const overrides = map.get(entity['id'] as string);
      return overrides ? { ...entity, ...overrides } : entity;
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async deleteForEntity(entityType: string, entityId: string): Promise<void> {
    await this.repo.delete({ entityType, entityId });
  }
}
