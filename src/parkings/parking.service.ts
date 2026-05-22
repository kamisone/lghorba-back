import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Parking, ParkingStatus } from './parking.entity';
import { ParkingOwnerPhone } from './parking-owner-phone.entity';
import { ParkingDocument } from './parking-document.entity';
import { Car } from '../cars/car.entity';
import { AssetUrlService } from '../asset-url/asset-url.service';

export interface CreateParkingDto {
  label: string;
  address: string;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  monthlyRentEur?: number | null;
  cautionEur?: number | null;
  paymentDueDay?: number | null;
  ownerName?: string | null;
  parkingType?: string | null;
  accessInstructions?: string | null;
  pedestrianCode?: string | null;
  gateCode?: string | null;
  dimensionNotes?: string | null;
  comments?: string | null;
  isActive?: boolean;
  status?: ParkingStatus;
  ownerPhones?: Array<{ phoneNumber: string; label?: string | null; sortOrder?: number }>;
}

export type UpdateParkingDto = Partial<CreateParkingDto>;

export interface ParkingFilters {
  status?: ParkingStatus | 'all';
  city?: string;
  isActive?: boolean;
  search?: string;
}

@Injectable()
export class ParkingService {
  constructor(
    @InjectRepository(Parking)
    private readonly parkingRepo: Repository<Parking>,
    @InjectRepository(ParkingOwnerPhone)
    private readonly phoneRepo: Repository<ParkingOwnerPhone>,
    @InjectRepository(Car)
    private readonly carRepo: Repository<Car>,
    private readonly assetUrlService: AssetUrlService,
  ) {}

  private async resolveDocumentUrls(docs: ParkingDocument[]): Promise<(ParkingDocument & { url: string })[]> {
    if (!docs.length) return [];
    const urlMap = await this.assetUrlService.resolveBatch(docs.map(d => d.gcsKey));
    return docs.map(d => Object.assign(d, { url: urlMap.get(d.gcsKey) ?? '' }));
  }

  async findAll(filters: ParkingFilters = {}): Promise<Parking[]> {
    const qb = this.parkingRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.ownerPhones', 'phones')
      .leftJoinAndSelect('p.documents', 'docs')
      .orderBy('p.label', 'ASC');

    if (filters.status && filters.status !== 'all') {
      qb.andWhere('p.status = :status', { status: filters.status });
    }
    if (filters.city) {
      qb.andWhere('LOWER(p.city) LIKE LOWER(:city)', { city: `%${filters.city}%` });
    }
    if (filters.isActive !== undefined) {
      qb.andWhere('p."isActive" = :isActive', { isActive: filters.isActive });
    }
    if (filters.search) {
      qb.andWhere(
        '(LOWER(p.label) LIKE LOWER(:s) OR LOWER(p.address) LIKE LOWER(:s) OR LOWER(p."ownerName") LIKE LOWER(:s))',
        { s: `%${filters.search}%` },
      );
    }

    const parkings = await qb.getMany();
    await Promise.all(parkings.map(async p => {
      if (p.documents?.length) {
        p.documents = await this.resolveDocumentUrls(p.documents) as any;
      }
    }));
    return parkings;
  }

  async findOne(id: string): Promise<Parking & { cars: Car[] }> {
    const parking = await this.parkingRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.ownerPhones', 'phones')
      .leftJoinAndSelect('p.documents', 'docs')
      .where('p.id = :id', { id })
      .getOne();

    if (!parking) throw new NotFoundException('Parking not found');

    if (parking.documents?.length) {
      parking.documents = await this.resolveDocumentUrls(parking.documents) as any;
    }

    const cars = await this.carRepo.find({ where: { parkingId: id } });

    return Object.assign(parking, { cars });
  }

  async create(dto: CreateParkingDto): Promise<Parking> {
    const parking = this.parkingRepo.create({
      label: dto.label,
      address: dto.address,
      city: dto.city ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      monthlyRentEur: dto.monthlyRentEur ?? null,
      cautionEur: dto.cautionEur ?? null,
      paymentDueDay: dto.paymentDueDay ?? null,
      ownerName: dto.ownerName ?? null,
      parkingType: (dto.parkingType as any) ?? null,
      accessInstructions: dto.accessInstructions ?? null,
      pedestrianCode: dto.pedestrianCode ?? null,
      gateCode: dto.gateCode ?? null,
      dimensionNotes: dto.dimensionNotes ?? null,
      comments: dto.comments ?? null,
      isActive: dto.isActive ?? true,
      status: dto.status ?? 'active',
      ownerPhones: (dto.ownerPhones ?? []).map((ph, i) =>
        this.phoneRepo.create({ phoneNumber: ph.phoneNumber, label: ph.label ?? null, sortOrder: ph.sortOrder ?? i }),
      ),
    });
    return this.parkingRepo.save(parking);
  }

  async update(id: string, dto: UpdateParkingDto): Promise<Parking> {
    const parking = await this.parkingRepo.findOne({ where: { id }, relations: ['ownerPhones', 'documents'] });
    if (!parking) throw new NotFoundException('Parking not found');

    const scalarFields: Array<keyof UpdateParkingDto> = [
      'label', 'address', 'city', 'latitude', 'longitude',
      'monthlyRentEur', 'cautionEur', 'paymentDueDay', 'ownerName',
      'parkingType', 'accessInstructions', 'pedestrianCode', 'gateCode',
      'dimensionNotes', 'comments', 'isActive', 'status',
    ];
    for (const field of scalarFields) {
      if (dto[field] !== undefined) {
        (parking as any)[field] = dto[field];
      }
    }

    if (dto.ownerPhones !== undefined) {
      await this.phoneRepo.delete({ parkingId: id });
      parking.ownerPhones = dto.ownerPhones.map((ph, i) =>
        this.phoneRepo.create({ parkingId: id, phoneNumber: ph.phoneNumber, label: ph.label ?? null, sortOrder: ph.sortOrder ?? i }),
      );
    }

    return this.parkingRepo.save(parking);
  }

  async remove(id: string): Promise<void> {
    const parking = await this.parkingRepo.findOne({ where: { id } });
    if (!parking) throw new NotFoundException('Parking not found');
    await this.parkingRepo.remove(parking);
  }

  async assignCar(parkingId: string, carId: string): Promise<void> {
    const [parking, car] = await Promise.all([
      this.parkingRepo.findOne({ where: { id: parkingId } }),
      this.carRepo.findOne({ where: { id: carId } }),
    ]);
    if (!parking) throw new NotFoundException('Parking not found');
    if (!car) throw new NotFoundException('Car not found');
    car.parkingId = parkingId;
    await this.carRepo.save(car);
  }

  async unassignCar(carId: string): Promise<void> {
    const car = await this.carRepo.findOne({ where: { id: carId } });
    if (!car) throw new NotFoundException('Car not found');
    car.parkingId = null;
    await this.carRepo.save(car);
  }

  async getAnalytics() {
    const [parkings, allCars] = await Promise.all([
      this.parkingRepo.find({ where: { isActive: true }, relations: ['ownerPhones'] }),
      this.carRepo.find(),
    ]);

    const totalMonthlyRent = parkings.reduce(
      (s, p) => s + (p.monthlyRentEur ? Number(p.monthlyRentEur) : 0), 0,
    );
    const totalCaution = parkings.reduce(
      (s, p) => s + (p.cautionEur ? Number(p.cautionEur) : 0), 0,
    );

    const costByCity: Record<string, number> = {};
    for (const p of parkings) {
      const city = p.city ?? 'Unknown';
      costByCity[city] = (costByCity[city] ?? 0) + (p.monthlyRentEur ? Number(p.monthlyRentEur) : 0);
    }

    const assignedCarIds = new Set(allCars.filter(c => c.parkingId).map(c => c.parkingId!));
    const occupiedCount = parkings.filter(p => assignedCarIds.has(p.id)).length;
    const unusedParkings = parkings.filter(p => !assignedCarIds.has(p.id));

    const vehiclesWithoutParking = allCars.filter(c => !c.parkingId).length;

    const byStatus = await this.parkingRepo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.status')
      .getRawMany<{ status: string; count: string }>();

    return {
      totalActive: parkings.length,
      totalMonthlyRent,
      totalCaution,
      costByCity,
      occupancyRate: parkings.length > 0 ? Math.round((occupiedCount / parkings.length) * 100) : 0,
      occupiedCount,
      unusedCount: unusedParkings.length,
      unusedParkings: unusedParkings.map(p => ({ id: p.id, label: p.label, city: p.city, monthlyRentEur: p.monthlyRentEur })),
      vehiclesWithoutParking,
      byStatus: Object.fromEntries(byStatus.map(r => [r.status, Number(r.count)])),
    };
  }

  async getCities(): Promise<string[]> {
    const rows = await this.parkingRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.city', 'city')
      .where('p.city IS NOT NULL')
      .orderBy('p.city', 'ASC')
      .getRawMany<{ city: string }>();
    return rows.map(r => r.city);
  }
}
