import {
  ConflictException, Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { z } from 'zod';
import { ShopVendor, VendorStatus } from '../entities/shop-vendor.entity';

export const CreateVendorSchema = z.object({
  businessName: z.string().min(1).max(300),
  email:        z.string().email().max(300),
  password:     z.string().min(8).max(200),
  description:  z.string().nullish(),
  website:      z.string().url().max(500).nullish(),
});

export const UpdateVendorSchema = z.object({
  businessName: z.string().min(1).max(300).optional(),
  description:  z.string().nullish(),
  website:      z.string().url().max(500).nullish(),
  logoKey:      z.string().max(500).nullish(),
}).partial();

export type CreateVendorDto = z.infer<typeof CreateVendorSchema>;
export type UpdateVendorDto = z.infer<typeof UpdateVendorSchema>;

@Injectable()
export class VendorService {
  constructor(
    @InjectRepository(ShopVendor) private readonly repo: Repository<ShopVendor>,
  ) {}

  async create(dto: CreateVendorDto): Promise<ShopVendor> {
    const existing = await this.repo.findOneBy({ email: dto.email });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const vendor = this.repo.create({
      businessName: dto.businessName,
      email:        dto.email,
      passwordHash,
      description:  dto.description ?? null,
      website:      dto.website ?? null,
      status:       'pending',
    });
    return this.repo.save(vendor);
  }

  async findById(id: string): Promise<ShopVendor> {
    const vendor = await this.repo.findOneBy({ id });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async findByEmail(email: string): Promise<ShopVendor | null> {
    return this.repo.findOneBy({ email });
  }

  async findAll(
    opts: { status?: VendorStatus; limit?: number; offset?: number } = {},
  ): Promise<{ items: ShopVendor[]; total: number }> {
    const { status, limit = 20, offset = 0 } = opts;
    const qb = this.repo.createQueryBuilder('v').orderBy('v.createdAt', 'DESC').take(limit).skip(offset);
    if (status) qb.andWhere('v.status = :status', { status });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async updateStatus(id: string, status: VendorStatus): Promise<ShopVendor> {
    const vendor = await this.findById(id);
    vendor.status = status;
    return this.repo.save(vendor);
  }

  async updateProfile(id: string, dto: UpdateVendorDto): Promise<ShopVendor> {
    const vendor = await this.findById(id);
    if (dto.businessName !== undefined) vendor.businessName = dto.businessName;
    if (dto.description  !== undefined) vendor.description  = dto.description ?? null;
    if (dto.website      !== undefined) vendor.website      = dto.website ?? null;
    if (dto.logoKey      !== undefined) vendor.logoKey      = dto.logoKey ?? null;
    return this.repo.save(vendor);
  }

  async validatePassword(vendor: ShopVendor, password: string): Promise<void> {
    const ok = await bcrypt.compare(password, vendor.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
  }

  async updateStripeConnect(
    id: string,
    stripeConnectId: string,
    payoutsStatus: ShopVendor['payoutsStatus'],
  ): Promise<void> {
    await this.repo.update(id, { stripeConnectId, payoutsStatus });
  }
}
