import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TranslationsService } from '../translations/translations.service';
import { VehicleFaq } from './vehicle-faq.entity';
import { CreateVehicleFaqDto, UpdateVehicleFaqDto } from './dto/vehicle-faq.dto';

// Entity type key used in the translations table — must be stable across deploys.
export const VEHICLE_FAQ_ENTITY_TYPE = 'vehicle_faq';

export interface PublicFaq {
  id: string;
  question: string;
  answer: string;
  position: number;
}

@Injectable()
export class VehicleFaqsService {
  constructor(
    @InjectRepository(VehicleFaq)
    private readonly repo: Repository<VehicleFaq>,
    private readonly translationsService: TranslationsService,
  ) {}

  // ── Public ────────────────────────────────────────────────────────────────────

  async findPublic(entityType: string, entityId: string, lang = 'fr'): Promise<PublicFaq[]> {
    const faqs = await this.repo.find({
      where: { entityType, entityId, isVisible: true },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
    if (!faqs.length) return [];

    const items: PublicFaq[] = faqs.map(f => ({
      id:       f.id,
      question: f.question,
      answer:   f.answer,
      position: f.position,
    }));

    if (lang === 'fr') return items;

    return this.translationsService.applyToEntities(
      items as unknown as Record<string, unknown>[],
      VEHICLE_FAQ_ENTITY_TYPE,
      lang,
    ) as unknown as PublicFaq[];
  }

  // ── Admin ─────────────────────────────────────────────────────────────────────

  findAll(entityType: string, entityId: string): Promise<VehicleFaq[]> {
    return this.repo.find({
      where: { entityType, entityId },
      order: { position: 'ASC', createdAt: 'ASC' },
    });
  }

  async findOne(id: string): Promise<VehicleFaq> {
    const faq = await this.repo.findOne({ where: { id } });
    if (!faq) throw new NotFoundException(`Vehicle FAQ ${id} not found`);
    return faq;
  }

  async create(dto: CreateVehicleFaqDto): Promise<VehicleFaq> {
    const count = await this.repo.count({
      where: { entityType: dto.entityType, entityId: dto.entityId },
    });
    const faq = this.repo.create({
      entityType: dto.entityType,
      entityId:   dto.entityId,
      question:   dto.question,
      answer:     dto.answer,
      position:   dto.position ?? count,
      isVisible:  dto.isVisible ?? true,
    });
    return this.repo.save(faq);
  }

  async update(id: string, dto: UpdateVehicleFaqDto): Promise<VehicleFaq> {
    const faq = await this.findOne(id);
    if (dto.question  !== undefined) faq.question  = dto.question;
    if (dto.answer    !== undefined) faq.answer    = dto.answer;
    if (dto.position  !== undefined) faq.position  = dto.position;
    if (dto.isVisible !== undefined) faq.isVisible = dto.isVisible;
    return this.repo.save(faq);
  }

  async remove(id: string): Promise<void> {
    const faq = await this.findOne(id);
    await Promise.all([
      this.repo.remove(faq),
      this.translationsService.deleteForEntity(VEHICLE_FAQ_ENTITY_TYPE, id),
    ]);
  }

  async reorder(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map((id, index) => this.repo.update(id, { position: index })),
    );
  }

  async toggleVisibility(id: string): Promise<VehicleFaq> {
    const faq = await this.findOne(id);
    faq.isVisible = !faq.isVisible;
    return this.repo.save(faq);
  }
}
