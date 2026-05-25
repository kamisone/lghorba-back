import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from '../entities/country.entity';
import { COUNTRY_SEED } from './country-seed.data';

@Injectable()
export class CountryService {
  constructor(
    @InjectRepository(Country) private readonly countryRepo: Repository<Country>,
  ) {}

  async seed(): Promise<void> {
    for (const data of COUNTRY_SEED) {
      const exists = await this.countryRepo.findOneBy({ isoCode: data.isoCode });
      if (!exists) {
        await this.countryRepo.save(this.countryRepo.create({ ...data, isActive: true }));
      }
    }
  }

  listActive(): Promise<Country[]> {
    return this.countryRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  listAll(): Promise<Country[]> {
    return this.countryRepo.find({ order: { name: 'ASC' } });
  }

  async create(dto: Partial<Country> & { isoCode: string; name: string }): Promise<Country> {
    const country = this.countryRepo.create({ isActive: true, isShippingEnabled: false, isEuVat: false, ...dto });
    return this.countryRepo.save(country);
  }

  async patch(isoCode: string, dto: Partial<Omit<Country, 'isoCode'>>): Promise<Country> {
    await this.countryRepo.update({ isoCode }, dto);
    return this.countryRepo.findOneByOrFail({ isoCode });
  }

  async remove(isoCode: string): Promise<void> {
    await this.countryRepo.delete({ isoCode });
  }
}
