import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  availableForFreeShipping: z.boolean().optional(),
});
export type UpsertZoneDto   = z.infer<typeof UpsertZoneSchema>;
export type UpsertMethodDto = z.infer<typeof UpsertMethodSchema>;

/**
 * Stand-in id for the free-shipping option. It is not a real method: the free
 * delivery is a property of the order, so binding it to one of the zone's
 * methods used to make that method unofferable as a paid upgrade. A nil UUID
 * keeps the existing `z.string().uuid()` contract intact; the checkout service
 * maps it to a NULL `shippingMethodId` (the column is nullable).
 */
export const FREE_SHIPPING_METHOD_ID = '00000000-0000-0000-0000-000000000000';

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
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    @InjectRepository(ShippingZone)   private readonly zoneRepo:   Repository<ShippingZone>,
    @InjectRepository(ShippingMethod) private readonly methodRepo: Repository<ShippingMethod>,
    private readonly translationsService: TranslationsService,
  ) {}

  /**
   * @param opts.forceFree the order already qualifies for free shipping for a
   * reason this service cannot see (a free-shipping product in the basket, or a
   * promotion/coupon resolved by the pricing engine).
   * @param opts.upgradeMethodIds the paid alternatives configured on the
   * free-shipping products. They keep their real price — they are the only
   * things the customer can still choose to pay for — while everything else is
   * quoted at 0. Any that belong to another shipping zone are absent from
   * `methods` here and so drop out naturally: the zone decides what is offered.
   *
   * When `forceFree` is set the list collapses to the free option plus those
   * upgrades. Quoting the rest would be a choice between identical zeroes.
   */
  async getMethodsForCountry(
    countryCode: string,
    cartTotalCents: number,
    lang?: string,
    opts: {
      forceFree?: boolean;
      upgradeMethodIds?: string[];
      /** Admin-configured delivery window for the free option, in days. */
      freeDaysMin?: number | null;
      freeDaysMax?: number | null;
    } = {},
  ): Promise<ShippingQuoteResult> {
    const zone = await this.resolveZoneForCountry(countryCode);
    if (!zone) return { zone: null, methods: [] };

    const methods = await this.methodRepo.find({
      where: { zoneId: zone.id, isActive: true },
      order: { sortOrder: 'ASC' },
    });

    const priced = opts.forceFree
      ? this.buildFreeShippingOptions(methods, zone, opts.upgradeMethodIds ?? [], {
          daysMin: opts.freeDaysMin ?? null,
          daysMax: opts.freeDaysMax ?? null,
        })
      : this.applyZonePricing(methods, zone, cartTotalCents);
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

  /**
   * Ordinary quoting, for orders that do not ship free.
   *
   * Methods flagged `availableForFreeShipping` are excluded: they exist to be
   * sold as the paid faster option *alongside* free shipping, so offering them
   * as a normal choice puts a free-shipping-only method in front of customers
   * buying an ordinary product.
   *
   * Fail-open if that would empty the zone. An admin who flagged every method
   * has misconfigured things, but silently offering no delivery at all blocks
   * every sale in that country — far worse than showing one method too many.
   * The warning says which zone to fix.
   */
  private applyZonePricing(
    methods: ShippingMethod[],
    zone: ShippingZone,
    cartTotalCents: number,
  ): any[] {
    const ordinary = methods.filter(m => !m.availableForFreeShipping);
    if (!ordinary.length && methods.length) {
      this.logger.warn(
        `Zone "${zone.name}" has no ordinary shipping method — every method is ` +
          `flagged "used for free shipping". Falling back to all of them so ` +
          `checkout still works; leave at least one method unflagged.`,
      );
    }
    const quotable = ordinary.length ? ordinary : methods;

    const zoneFree = zone.freeShippingThresholdCents !== null
      && cartTotalCents >= zone.freeShippingThresholdCents;

    return quotable.map(m => {
      const methodFree = m.freeAboveCents !== null && cartTotalCents >= m.freeAboveCents;
      const isFree = zoneFree || methodFree;

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

  /**
   * The options offered on a free-shipping order: free delivery, plus every
   * faster method the admin attached that serves this customer's zone.
   *
   * The free entry is synthetic. Earlier it borrowed one of the zone's methods
   * for its name and delivery window, which meant a method could not be both the
   * free baseline and a paid upgrade — so a zone with a single method silently
   * offered nothing to upgrade to. Free delivery is a property of the order, not
   * of a carrier, so it no longer consumes one.
   *
   * `methods` is already scoped to the customer's zone, so attached methods from
   * other zones are simply absent — that is the country-based filtering.
   */
  private buildFreeShippingOptions(
    methods: ShippingMethod[],
    zone: ShippingZone,
    upgradeMethodIds: string[],
    freeDays: { daysMin: number | null; daysMax: number | null } = {
      daysMin: null,
      daysMax: null,
    },
  ): any[] {
    const upgrades = upgradeMethodIds.length
      ? methods.filter(m => upgradeMethodIds.includes(m.id) && m.availableForFreeShipping)
      : [];

    // Delivery window for free shipping: whatever the admin set on the product,
    // else borrowed from the zone's ordinary (non-upgrade) method, else the
    // slowest method available — free delivery is never faster than what you can
    // pay for.
    const upgradeIds = new Set(upgrades.map(m => m.id));
    const reference =
      methods.find(m => !upgradeIds.has(m.id)) ??
      [...methods].sort((a, b) => b.estimatedDaysMax - a.estimatedDaysMax)[0] ??
      null;
    // Only an explicit max counts as configured; a min alone would advertise an
    // open-ended window.
    const configured = freeDays.daysMax != null;
    const daysMin = configured ? freeDays.daysMin ?? 0 : reference?.estimatedDaysMin ?? 0;
    const daysMax = configured ? freeDays.daysMax! : reference?.estimatedDaysMax ?? 0;

    const options: any[] = [
      {
        id: FREE_SHIPPING_METHOD_ID,
        zoneId: zone.id,
        name: 'Free shipping',
        description: null,
        carrier: null,
        priceCents: 0,
        originalPriceCents: 0,
        freeAboveCents: null,
        estimatedDaysMin: daysMin,
        estimatedDaysMax: daysMax,
        isActive: true,
        sortOrder: -1,
        availableForFreeShipping: false,
        isFree: true,
      },
    ];

    for (const upgrade of upgrades) {
      const price = upgrade.priceCents + zone.surchargeCents;
      options.push({
        ...upgrade,
        priceCents: price,
        originalPriceCents: price,
        isFree: false,
        isFreeShippingUpgrade: true,
      });
    }

    return options;
  }

  /**
   * Storefront "delivery details" panel: every active zone paired with its
   * active, ordinary (non-upgrade-only) methods. Not scoped to a country —
   * the panel shows the whole coverage map, not a single customer's quote —
   * so it excludes `availableForFreeShipping` methods the same way
   * `applyZonePricing` does for ordinary quoting, since those only ever
   * appear alongside a free-shipping product and would otherwise read as a
   * normal paid option in every zone. Same fail-open as that method too: a
   * zone where every method is flagged that way falls back to showing all of
   * them rather than rendering an empty, misconfigured-looking zone.
   */
  async getPublicOverview(lang?: string): Promise<Array<{
    id: string;
    name: string;
    countryCodes: string[];
    estimatedDeliveryDays: string | null;
    methods: Array<{
      id: string;
      name: string;
      carrier: string | null;
      priceCents: number;
      estimatedDaysMin: number;
      estimatedDaysMax: number;
    }>;
  }>> {
    const [zones, methods] = await Promise.all([
      this.zoneRepo.find({ where: { isActive: true } }),
      this.methodRepo.find({
        where: { isActive: true },
        order: { sortOrder: 'ASC' },
      }),
    ]);
    const translated: any[] = await this.translationsService.maybeApply(methods as any[], ET_SHOP_SHIPPING_METHOD, lang);

    const methodsByZone = new Map<string, any[]>();
    for (const m of translated) {
      const bucket = methodsByZone.get(m.zoneId);
      if (bucket) bucket.push(m); else methodsByZone.set(m.zoneId, [m]);
    }

    return zones
      .map(z => {
        const zoneMethods = methodsByZone.get(z.id) ?? [];
        const ordinary = zoneMethods.filter(m => !m.availableForFreeShipping);
        const quotable = ordinary.length ? ordinary : zoneMethods;
        return { zone: z, quotable };
      })
      .filter(({ quotable }) => quotable.length)
      .map(({ zone: z, quotable }) => ({
        id: z.id,
        name: z.name,
        countryCodes: z.countryCodes,
        estimatedDeliveryDays: z.estimatedDeliveryDays,
        methods: quotable.map(m => ({
          id: m.id,
          name: m.name,
          carrier: m.carrier,
          priceCents: m.priceCents,
          estimatedDaysMin: m.estimatedDaysMin,
          estimatedDaysMax: m.estimatedDaysMax,
        })),
      }));
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

  /**
   * Methods an admin may attach to a free-shipping product as paid upgrades.
   * Feeds the picker on the product form, so only active + eligible ones, with
   * their zone — a customer is only ever offered the ones in their own zone, so
   * the admin needs to see which zone each belongs to when choosing.
   */
  async listFreeShippingUpgradeMethods(): Promise<
    Array<ShippingMethod & { zoneName: string; zoneCountryCodes: string[] }>
  > {
    const methods = await this.methodRepo.find({
      where: { availableForFreeShipping: true, isActive: true },
      relations: ['zone'],
      order: { sortOrder: 'ASC' },
    });
    return methods.map((m) => ({
      ...m,
      zoneName: m.zone?.name ?? '—',
      zoneCountryCodes: m.zone?.countryCodes ?? [],
    }));
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
      availableForFreeShipping: dto.availableForFreeShipping ?? false,
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
      availableForFreeShipping: dto.availableForFreeShipping !== undefined
        ? dto.availableForFreeShipping
        : method.availableForFreeShipping,
    });
    return this.methodRepo.save(method);
  }

  async deleteMethod(id: string): Promise<void> {
    await this.methodRepo.delete(id);
  }
}
