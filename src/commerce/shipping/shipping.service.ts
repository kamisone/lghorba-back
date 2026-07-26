import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { ShippingZone } from '../entities/shipping-zone.entity';
import { ShippingMethod } from '../entities/shipping-method.entity';
import { TranslationsService } from '../../translations/translations.service';
import { ET_SHOP_SHIPPING_METHOD } from '../../common/entity-types';

export const UpsertZoneSchema = z.object({
  name:                        z.string().min(1).max(200),
  countryCodes:                z.array(z.string().min(2).max(2)),
  isActive:                    z.boolean().optional(),
  surchargeCents:              z.number().int().min(0).optional(),
  freeShippingThresholdCents:  z.number().int().min(0).nullish(),
  estimatedDeliveryDays:       z.string().max(100).nullish(),
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

export interface ZoneInfo {
  id:                         string;
  name:                       string;
  surchargeCents:             number;
  freeShippingThresholdCents: number | null;
  estimatedDeliveryDays:      string | null;
}

export interface ShippingQuoteResult {
  zone:    ZoneInfo | null;
  methods: any[];
}

@Injectable()
export class ShippingService {
  constructor(
    @InjectRepository(ShippingZone)   private readonly zoneRepo:   Repository<ShippingZone>,
    @InjectRepository(ShippingMethod) private readonly methodRepo: Repository<ShippingMethod>,
    private readonly translationsService: TranslationsService,
  ) {}

  /**
   * @param opts.forceFree the order already qualifies for free shipping for a
   * reason this service cannot see (a free-shipping product in the basket, or a
   * promotion/coupon resolved by the pricing engine). Methods are quoted at 0 so
   * the customer is never shown a price that will not be charged.
   */
  async getMethodsForCountry(
    countryCode: string,
    cartTotalCents: number,
    lang?: string,
    opts: { forceFree?: boolean } = {},
  ): Promise<ShippingQuoteResult> {
    const zone = await this.resolveZoneForCountry(countryCode);
    if (!zone) return { zone: null, methods: [] };

    const methods = await this.methodRepo.find({
      where: { zoneId: zone.id, isActive: true },
      order: { sortOrder: 'ASC' },
    });

    const priced = this.applyZonePricing(methods, zone, cartTotalCents, opts.forceFree);
    const translated = await this.translationsService.maybeApply(priced, ET_SHOP_SHIPPING_METHOD, lang);

    return {
      zone: {
        id:                         zone.id,
        name:                       zone.name,
        surchargeCents:             zone.surchargeCents,
        freeShippingThresholdCents: zone.freeShippingThresholdCents,
        estimatedDeliveryDays:      zone.estimatedDeliveryDays,
      },
      methods: translated,
    };
  }

  private async resolveZoneForCountry(countryCode: string): Promise<ShippingZone | null> {
    const zones = await this.zoneRepo
      .createQueryBuilder('z')
      .where(':code = ANY(z.countryCodes)', { code: countryCode })
      .andWhere('z.isActive = true')
      .getMany();

    if (zones.length) return zones[0];

    const worldwide = await this.zoneRepo
      .createQueryBuilder('z')
      .where('z.countryCodes = :empty', { empty: '{}' })
      .andWhere('z.isActive = true')
      .getOne();

    return worldwide ?? null;
  }

  private applyZonePricing(
    methods: ShippingMethod[],
    zone: ShippingZone,
    cartTotalCents: number,
    forceFree = false,
  ): any[] {
    const zoneFree = zone.freeShippingThresholdCents !== null
      && cartTotalCents >= zone.freeShippingThresholdCents;

    return methods.map(m => {
      const methodFree = m.freeAboveCents !== null && cartTotalCents >= m.freeAboveCents;
      const isFree = forceFree || zoneFree || methodFree;

      return {
        ...m,
        priceCents: isFree ? 0 : m.priceCents + zone.surchargeCents,
        // Kept alongside the zeroed price so the storefront can strike through
        // what the method would otherwise have cost.
        originalPriceCents: m.priceCents + zone.surchargeCents,
        isFree,
      };
    });
  }

  async listZones(): Promise<ShippingZone[]> {
    return this.zoneRepo.find();
  }

  async createZone(dto: UpsertZoneDto): Promise<ShippingZone> {
    return this.zoneRepo.save(this.zoneRepo.create({
      name:                        dto.name,
      countryCodes:                dto.countryCodes,
      isActive:                    dto.isActive ?? true,
      surchargeCents:              dto.surchargeCents ?? 0,
      freeShippingThresholdCents:  dto.freeShippingThresholdCents ?? null,
      estimatedDeliveryDays:       dto.estimatedDeliveryDays ?? null,
    }));
  }

  async updateZone(id: string, dto: Partial<UpsertZoneDto>): Promise<ShippingZone> {
    const zone = await this.zoneRepo.findOneBy({ id });
    if (!zone) throw new NotFoundException('Shipping zone not found');
    if (dto.name !== undefined)                        zone.name = dto.name;
    if (dto.countryCodes !== undefined)                 zone.countryCodes = dto.countryCodes;
    if (dto.isActive !== undefined)                     zone.isActive = dto.isActive;
    if (dto.surchargeCents !== undefined)               zone.surchargeCents = dto.surchargeCents;
    if (dto.freeShippingThresholdCents !== undefined)   zone.freeShippingThresholdCents = dto.freeShippingThresholdCents ?? null;
    if (dto.estimatedDeliveryDays !== undefined)        zone.estimatedDeliveryDays = dto.estimatedDeliveryDays ?? null;
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
