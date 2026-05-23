import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { z } from 'zod';
import { ShopCustomer } from '../entities/shop-customer.entity';
import { ShopCustomerAddress } from '../entities/shop-customer-address.entity';

export const UpsertAddressSchema = z.object({
  name:    z.string().min(1).max(300),
  line1:   z.string().min(1).max(500),
  line2:   z.string().max(500).nullish(),
  city:    z.string().min(1).max(200),
  zip:     z.string().min(1).max(20),
  country: z.string().min(2).max(10),
  isDefault: z.boolean().optional(),
});
export type UpsertAddressDto = z.infer<typeof UpsertAddressSchema>;

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(ShopCustomer)        private readonly customerRepo: Repository<ShopCustomer>,
    @InjectRepository(ShopCustomerAddress) private readonly addressRepo:  Repository<ShopCustomerAddress>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Called during order creation ────────────────────────────────────────────

  async upsertFromOrder(
    email: string,
    name: string | null,
    phone: string | null,
    userId: string | null,
    em?: EntityManager,
  ): Promise<ShopCustomer> {
    const repo = em ? em.getRepository(ShopCustomer) : this.customerRepo;

    let customer = await repo.findOneBy({ email });
    if (!customer) {
      const [firstName, ...rest] = (name ?? '').split(' ');
      customer = repo.create({
        email,
        firstName: firstName || null,
        lastName:  rest.join(' ') || null,
        phone:     phone ?? null,
        userId:    userId ?? null,
      });
      customer = await repo.save(customer);
    } else {
      // Link to user account if not yet linked
      if (userId && !customer.userId) {
        customer.userId = userId;
        await repo.save(customer);
      }
    }
    return customer;
  }

  // ── Called when order ships (update stats) ──────────────────────────────────

  async recordOrderCompletion(email: string, totalCents: number, em?: EntityManager): Promise<void> {
    const repo = em ? em.getRepository(ShopCustomer) : this.customerRepo;
    await repo
      .createQueryBuilder()
      .update()
      .set({
        totalOrders:    () => '"totalOrders" + 1',
        totalSpentCents: () => `"totalSpentCents" + ${totalCents}`,
      })
      .where('email = :email', { email })
      .execute();
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async findByEmail(email: string): Promise<ShopCustomer | null> {
    return this.customerRepo.findOne({ where: { email }, relations: ['addresses'] });
  }

  async findById(id: string): Promise<ShopCustomer> {
    const customer = await this.customerRepo.findOne({ where: { id }, relations: ['addresses'] });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async adminList(search?: string, limit = 20, offset = 0): Promise<{ items: ShopCustomer[]; total: number }> {
    const qb = this.customerRepo.createQueryBuilder('c')
      .orderBy('c.createdAt', 'DESC')
      .take(limit)
      .skip(offset);
    if (search) {
      qb.andWhere('(c.email ILIKE :q OR c.firstName ILIKE :q OR c.lastName ILIKE :q)', { q: `%${search}%` });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  // ── Addresses ────────────────────────────────────────────────────────────────

  async addAddress(customerId: string, dto: UpsertAddressDto): Promise<ShopCustomerAddress> {
    const customer = await this.customerRepo.findOneBy({ id: customerId });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.dataSource.transaction(async (em) => {
      if (dto.isDefault) {
        await em.getRepository(ShopCustomerAddress)
          .createQueryBuilder()
          .update()
          .set({ isDefault: false })
          .where('customerId = :customerId', { customerId })
          .execute();
      }
      return em.save(ShopCustomerAddress, em.create(ShopCustomerAddress, {
        customerId,
        name:      dto.name,
        line1:     dto.line1,
        line2:     dto.line2 ?? null,
        city:      dto.city,
        zip:       dto.zip,
        country:   dto.country,
        isDefault: dto.isDefault ?? false,
      }));
    });
  }

  async updateAddress(addressId: string, dto: Partial<UpsertAddressDto>): Promise<ShopCustomerAddress> {
    const address = await this.addressRepo.findOneBy({ id: addressId });
    if (!address) throw new NotFoundException('Address not found');

    return this.dataSource.transaction(async (em) => {
      if (dto.isDefault) {
        await em.getRepository(ShopCustomerAddress)
          .createQueryBuilder()
          .update()
          .set({ isDefault: false })
          .where('customerId = :customerId', { customerId: address.customerId })
          .execute();
      }
      Object.assign(address, {
        name:      dto.name      ?? address.name,
        line1:     dto.line1     ?? address.line1,
        line2:     dto.line2     !== undefined ? dto.line2 ?? null : address.line2,
        city:      dto.city      ?? address.city,
        zip:       dto.zip       ?? address.zip,
        country:   dto.country   ?? address.country,
        isDefault: dto.isDefault !== undefined ? dto.isDefault : address.isDefault,
      });
      return em.save(ShopCustomerAddress, address);
    });
  }

  async deleteAddress(addressId: string): Promise<void> {
    await this.addressRepo.delete(addressId);
  }
}
