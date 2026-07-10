import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { QuickReply } from './quick-reply.entity';
import { CreateQuickReplyDto, UpdateQuickReplyDto } from './dto/quick-reply.dto';

export interface ListQuickRepliesOptions {
  search?:   string;
  category?: string;
  active?:   boolean;
}

@Injectable()
export class QuickRepliesService {
  constructor(
    @InjectRepository(QuickReply)
    private readonly repo: Repository<QuickReply>,
  ) {}

  findAll(opts: ListQuickRepliesOptions = {}): Promise<QuickReply[]> {
    const qb = this.repo.createQueryBuilder('qr');

    if (opts.active !== undefined) {
      qb.andWhere('qr.isActive = :active', { active: opts.active });
    }
    if (opts.category) {
      qb.andWhere('qr.category = :category', { category: opts.category });
    }
    if (opts.search) {
      qb.andWhere(new Brackets(w => {
        w.where('qr.title ILIKE :q', { q: `%${opts.search}%` })
          .orWhere('qr.body ILIKE :q', { q: `%${opts.search}%` });
      }));
    }

    // Most-used first so the fleet Replies tab surfaces the handiest replies on top.
    return qb
      .orderBy('qr.usageCount', 'DESC')
      .addOrderBy('qr.updatedAt', 'DESC')
      .getMany();
  }

  async categories(): Promise<string[]> {
    const rows: { category: string }[] = await this.repo
      .createQueryBuilder('qr')
      .select('DISTINCT qr.category', 'category')
      .orderBy('category', 'ASC')
      .getRawMany();
    return rows.map(r => r.category);
  }

  async findOne(id: string): Promise<QuickReply> {
    const reply = await this.repo.findOne({ where: { id } });
    if (!reply) throw new NotFoundException(`Quick reply ${id} not found`);
    return reply;
  }

  create(dto: CreateQuickReplyDto): Promise<QuickReply> {
    const reply = this.repo.create({
      title:    dto.title,
      body:     dto.body,
      category: dto.category ?? 'general',
      isActive: dto.isActive ?? true,
    });
    return this.repo.save(reply);
  }

  async update(id: string, dto: UpdateQuickReplyDto): Promise<QuickReply> {
    const reply = await this.findOne(id);
    if (dto.title    !== undefined) reply.title    = dto.title;
    if (dto.body     !== undefined) reply.body     = dto.body;
    if (dto.category !== undefined) reply.category = dto.category;
    if (dto.isActive !== undefined) reply.isActive = dto.isActive;
    return this.repo.save(reply);
  }

  async toggleActive(id: string): Promise<QuickReply> {
    const reply = await this.findOne(id);
    reply.isActive = !reply.isActive;
    return this.repo.save(reply);
  }

  // Atomic increment — safe under concurrent copies, no read-modify-write race.
  async trackUsage(id: string): Promise<void> {
    const result = await this.repo
      .createQueryBuilder()
      .update(QuickReply)
      .set({ usageCount: () => '"usageCount" + 1', lastUsedAt: () => 'now()' })
      .where('id = :id', { id })
      .execute();
    if (!result.affected) throw new NotFoundException(`Quick reply ${id} not found`);
  }

  async remove(id: string): Promise<void> {
    const reply = await this.findOne(id);
    await this.repo.remove(reply);
  }
}
