import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { BlogCategory } from '../entities/blog-category.entity';
import { slugify } from './blog-slug.util';

export const CreateCategorySchema = z.object({
  name:        z.string().min(1).max(300),
  slug:        z.string().min(1).max(300).optional(),
  color:       z.string().length(7).regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  description: z.string().nullish(),
  sortOrder:   z.number().int().min(0).optional(),
  isActive:    z.boolean().optional(),
});

export const UpdateCategorySchema = CreateCategorySchema.partial();

export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;

@Injectable()
export class BlogCategoryService {
  constructor(
    @InjectRepository(BlogCategory)
    private readonly repo: Repository<BlogCategory>,
  ) {}

  findAll(activeOnly = false): Promise<BlogCategory[]> {
    return this.repo.find({
      where: activeOnly ? { isActive: true } : {},
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<BlogCategory> {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    return cat;
  }

  async findBySlug(slug: string): Promise<BlogCategory | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async create(dto: CreateCategoryDto): Promise<BlogCategory> {
    const slug = dto.slug ?? slugify(dto.name);
    const existing = await this.repo.findOne({ where: { slug } });
    if (existing) throw new ConflictException(`Slug "${slug}" already exists`);
    const cat = this.repo.create({ ...dto, slug });
    return this.repo.save(cat);
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<BlogCategory> {
    const cat = await this.findOne(id);
    if (dto.slug && dto.slug !== cat.slug) {
      const existing = await this.repo.findOne({ where: { slug: dto.slug } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Slug "${dto.slug}" already exists`);
      }
    }
    Object.assign(cat, dto);
    return this.repo.save(cat);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }
}
