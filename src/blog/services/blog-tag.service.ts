import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { BlogTag } from '../entities/blog-tag.entity';
import { slugify } from './blog-slug.util';

export const CreateTagSchema = z.object({
  name: z.string().min(1).max(300),
  slug: z.string().min(1).max(300).optional(),
});

export const UpdateTagSchema = CreateTagSchema.partial();

export type CreateTagDto = z.infer<typeof CreateTagSchema>;
export type UpdateTagDto = z.infer<typeof UpdateTagSchema>;

@Injectable()
export class BlogTagService {
  constructor(
    @InjectRepository(BlogTag)
    private readonly repo: Repository<BlogTag>,
  ) {}

  findAll(): Promise<BlogTag[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<BlogTag> {
    const tag = await this.repo.findOne({ where: { id } });
    if (!tag) throw new NotFoundException(`Tag ${id} not found`);
    return tag;
  }

  async create(dto: CreateTagDto): Promise<BlogTag> {
    const slug = dto.slug ?? slugify(dto.name);
    const existing = await this.repo.findOne({ where: { slug } });
    if (existing) throw new ConflictException(`Slug "${slug}" already exists`);
    const tag = this.repo.create({ ...dto, slug });
    return this.repo.save(tag);
  }

  async update(id: string, dto: UpdateTagDto): Promise<BlogTag> {
    const tag = await this.findOne(id);
    if (dto.slug && dto.slug !== tag.slug) {
      const existing = await this.repo.findOne({ where: { slug: dto.slug } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Slug "${dto.slug}" already exists`);
      }
    }
    Object.assign(tag, dto);
    return this.repo.save(tag);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }
}
