import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { ShippingZone } from '../entities/shipping-zone.entity';
import { ShippingMethod } from '../entities/shipping-method.entity';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_SHIPPING_METHOD } from '../shared/entity-types';

export const UpsertZoneSchema = z.object({
  name:         z.string().min(1).max(200),
  countryCodes: z.array(z.string().min(2).max(2)),
  isActive:     z.boolean().optional(),
});
export const UpsertMethodSchema = z.object({
  zoneId:           z.string().uuid(),
  name:             z.string().min(1).max(200),
  carrier:          z.string().max(200).nullish(),
  priceCents:       z.number().int().min(0),
  freeAboveCents:   z.number().int().min(0).nullish(),
  estimatedDaysMin: z.number().int().min(0).optional(),
  estimatedDaysMax: z.number().int().min(0).optional(),
  isActive:         z.boolean().optional(),
  sortOrder:        z.number().int().optional(),
});
export type UpsertZoneDto   = z.infer<typeof UpsertZoneSchema>;
export type UpsertMethodDto = z.infer<typeof UpsertMethodSchema>;

@Injectable()
export class ShippingService {
  constructor(
    @InjectRepository(ShippingZone)   private readonly zoneRepo:   Repository<ShippingZone>,
    @InjectRepository(ShippingMethod) private readonly methodRepo: Repository<ShippingMethod>,
    @Optional() private readonly translationsService: TranslationsService,
  ) {}

  async getMethodsForCountry(countryCode: string, cartTotalCents: number, lang?: string): Promise<any[]> {
    // Find zones that include this country
    const zones = await this.zoneRepo
      .createQueryBuilder('z')
      .where(':code = ANY(z.countryCodes)', { code: countryCode })
      .andWhere('z.isActive = true')
      .getMany();

    let methods: ShippingMethod[];
    if (!zones.length) {
      // Fallback: zones with empty countryCodes = worldwide
      const worldwide = await this.zoneRepo.find({ where: { isActive: true } });
      if (!worldwide.length) return [];
      methods = await this.methodRepo.find({
        where: { zoneId: worldwide[0].id, isActive: true },
        order: { sortOrder: 'ASC' },
      });
    } else {
      methods = await this.methodRepo.find({
        where: { zoneId: zones[0].id, isActive: true },
        order: { sortOrder: 'ASC' },
      });
    }

    let result: any[] = this.applyFreeShipping(methods, cartTotalCents);
    if (lang && this.translationsService) {
      result = await this.translationsService.applyToEntities(result, ET_SHOP_SHIPPING_METHOD, lang);
    }
    return result;
  }

  private applyFreeShipping(methods: ShippingMethod[], cartTotalCents: number): ShippingMethod[] {
    return methods.map(m => {
      if (m.freeAboveCents !== null && cartTotalCents >= m.freeAboveCents) {
        return { ...m, priceCents: 0 };
      }
      return m;
    });
  }

  async listZones(): Promise<ShippingZone[]> {
    return this.zoneRepo.find();
  }

  async createZone(dto: UpsertZoneDto): Promise<ShippingZone> {
    return this.zoneRepo.save(this.zoneRepo.create({
      name:         dto.name,
      countryCodes: dto.countryCodes,
      isActive:     dto.isActive ?? true,
    }));
  }

  async updateZone(id: string, dto: Partial<UpsertZoneDto>): Promise<ShippingZone> {
    const zone = await this.zoneRepo.findOneBy({ id });
    if (!zone) throw new NotFoundException('Shipping zone not found');
    Object.assign(zone, dto);
    return this.zoneRepo.save(zone);
  }

  async deleteZone(id: string): Promise<void> {
    await this.zoneRepo.delete(id);
  }

  async listMethods(zoneId?: string): Promise<ShippingMethod[]> {
    return this.methodRepo.find({
      where: zoneId ? { zoneId } : {},
      order: { sortOrder: 'ASC' },
    });
  }

  async createMethod(dto: UpsertMethodDto): Promise<ShippingMethod> {
    const zone = await this.zoneRepo.findOneBy({ id: dto.zoneId });
    if (!zone) throw new NotFoundException('Shipping zone not found');
    return this.methodRepo.save(this.methodRepo.create({
      zoneId:           dto.zoneId,
      name:             dto.name,
      carrier:          dto.carrier ?? null,
      priceCents:       dto.priceCents,
      freeAboveCents:   dto.freeAboveCents ?? null,
      estimatedDaysMin: dto.estimatedDaysMin ?? 2,
      estimatedDaysMax: dto.estimatedDaysMax ?? 5,
      isActive:         dto.isActive ?? true,
      sortOrder:        dto.sortOrder ?? 0,
    }));
  }

  async updateMethod(id: string, dto: Partial<UpsertMethodDto>): Promise<ShippingMethod> {
    const method = await this.methodRepo.findOneBy({ id });
    if (!method) throw new NotFoundException('Shipping method not found');
    Object.assign(method, {
      name:             dto.name             ?? method.name,
      carrier:          dto.carrier          !== undefined ? dto.carrier ?? null : method.carrier,
      priceCents:       dto.priceCents       ?? method.priceCents,
      freeAboveCents:   dto.freeAboveCents   !== undefined ? dto.freeAboveCents ?? null : method.freeAboveCents,
      estimatedDaysMin: dto.estimatedDaysMin ?? method.estimatedDaysMin,
      estimatedDaysMax: dto.estimatedDaysMax ?? method.estimatedDaysMax,
      isActive:         dto.isActive         !== undefined ? dto.isActive : method.isActive,
      sortOrder:        dto.sortOrder        !== undefined ? dto.sortOrder : method.sortOrder,
    });
    return this.methodRepo.save(method);
  }

  async deleteMethod(id: string): Promise<void> {
    await this.methodRepo.delete(id);
  }
}
