import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ET_SHOP_COUNTRY } from '../../common/entity-types';
import { TranslationsService } from '../../translations/translations.service';
import { Country } from '../entities/country.entity';
import { COUNTRY_SEED } from './country-seed.data';

@Injectable()
export class CountryService {
  constructor(
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
    private readonly translationsService: TranslationsService,
  ) {}

  async seed(): Promise<void> {
    for (const { nameEn, ...data } of COUNTRY_SEED) {
      const exists = await this.countryRepo.findOneBy({
        isoCode: data.isoCode,
      });
      if (!exists) {
        await this.countryRepo.save(
          this.countryRepo.create({ ...data, isActive: true }),
        );
        await this.translationsService.upsert({
          entityType: ET_SHOP_COUNTRY,
          entityId: data.isoCode,
          field: 'name',
          lang: 'en',
          value: nameEn,
        });
      }
    }
  }

  // `Country`'s PK is `isoCode`, not `id` — translationsService keys off `entity.id`,
  // so we map isoCode → id before applying the overlay.
  async listActive(lang?: string): Promise<Country[]> {
    const countries = await this.countryRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
    const withId = countries.map((c) => ({ ...c, id: c.isoCode }));
    return this.translationsService.maybeApply(withId, ET_SHOP_COUNTRY, lang);
  }

  listAll(): Promise<Country[]> {
    return this.countryRepo.find({ order: { name: 'ASC' } });
  }

  async create(
    dto: Partial<Country> & { isoCode: string; name: string },
  ): Promise<Country> {
    const country = this.countryRepo.create({
      isActive: true,
      isShippingEnabled: false,
      isEuVat: false,
      ...dto,
    });
    return this.countryRepo.save(country);
  }

  async patch(
    isoCode: string,
    dto: Partial<Omit<Country, 'isoCode'>>,
  ): Promise<Country> {
    await this.countryRepo.update({ isoCode }, dto);
    return this.countryRepo.findOneByOrFail({ isoCode });
  }

  async remove(isoCode: string): Promise<void> {
    await this.countryRepo.delete({ isoCode });
  }
}
