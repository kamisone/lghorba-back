import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { extname } from 'path';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Booking, CANCELLED_STATUSES } from '../bookings/booking.entity';
import { GcsService } from '../gcs/gcs.service';
import { RentSession, RentSessionStatus } from '../rent-sessions/rent-session.entity';
import { TranslationsService } from '../translations/translations.service';
import { VehicleAvailabilityService } from '../vehicle-availability/vehicle-availability.service';
import { VehicleHealthService } from '../vehicle-health/vehicle-health.service';
import { CarDeliveryLocation } from './car-delivery-location.entity';
import { CarPhoto } from './car-photo.entity';
import { Car } from './car.entity';
import { CreateCarDto } from './dto/create-car.dto';
import { SearchCarsDto } from './dto/search-cars.dto';
import { haversineKm } from '../common/utils/map.util';
import { UpdateCarDto } from './dto/update-car.dto';

type CarWithRentStatus = Car & { isCurrentlyRented: boolean; isTrackingActive: boolean };

@Injectable()
export class CarsService {
  constructor(
    @InjectRepository(Car)
    private readonly repo: Repository<Car>,
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
    @InjectRepository(CarPhoto)
    private readonly photoRepo: Repository<CarPhoto>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(CarDeliveryLocation)
    private readonly deliveryLocationRepo: Repository<CarDeliveryLocation>,
    private readonly gcsService: GcsService,
    private readonly translationsService: TranslationsService,
    private readonly availabilityService: VehicleAvailabilityService,
    private readonly vehicleHealthService: VehicleHealthService,
  ) {}

  async findAllPublic(lang?: string) {
    const today = new Date().toISOString().slice(0, 10);
    const [cars, blockedIds, healthMap] = await Promise.all([
      this.findAll(),
      this.availabilityService.getBlockedCarIds(today),
      this.vehicleHealthService.getHealthMap(),
    ]);
    const publicCars = cars.map((car) => ({
      id: car.id,
      name: car.name,
      description: car.description,
      hasPhoto: car.photo !== null,
      healthStatus: healthMap.get(car.id) ?? 'healthy',
      isAvailable: !car.isCurrentlyRented && !blockedIds.has(car.id) && !['unsafe','critical'].includes(healthMap.get(car.id) ?? 'healthy'),
      brand: car.brand,
      model: car.model,
      finishing: car.finishing,
      modelYear: car.modelYear,
      vehicleType: car.vehicleType,
      energy: car.energy,
      gearbox: car.gearbox,
      din: car.din,
      mileage: car.mileage,
      numberOfDoors: car.numberOfDoors,
      numberOfSeats: car.numberOfSeats,
      color: car.color,
      vehicleCondition: car.vehicleCondition,
      deliveryEnabled: car.deliveryEnabled,
      deliveryType: car.deliveryType,
      deliveryRadiusKm: car.deliveryRadiusKm,
    }));
    if (!lang || lang === 'fr') return publicCars;
    return this.translationsService.applyToEntities(
      publicCars as Record<string, unknown>[],
      'car',
      lang,
    );
  }

  async findOnePublic(id: string, lang?: string) {
    const today = new Date().toISOString().slice(0, 10);
    const [car, blocked, deliveryLocations, healthStatus] = await Promise.all([
      this.findOne(id),
      this.availabilityService.isBlocked(id, `${today}T00:00`, `${today}T23:59`),
      this.deliveryLocationRepo.find({ where: { carId: id }, order: { createdAt: 'ASC' } }),
      this.vehicleHealthService.getHealthStatus(id),
    ]);
    const { immatriculation, phoneNumber, photo, isCurrentlyRented, isTrackingActive, ...rest } = car;
    const publicLocations = deliveryLocations.map(({ id: locId, label, address, lat, lng, radiusKm, price }) => ({
      id: locId, label, address, lat, lng, radiusKm, price: price !== null ? Number(price) : null,
    }));
    const healthBlocking = healthStatus === 'unsafe' || healthStatus === 'critical';
    const publicCar = {
      ...rest,
      deliveryRadiusPrice: rest.deliveryRadiusPrice !== null ? Number(rest.deliveryRadiusPrice) : null,
      hasPhoto: photo !== null,
      isAvailable: !isCurrentlyRented && !blocked && !healthBlocking,
      healthStatus,
      deliveryLocations: publicLocations,
    };
    if (!lang || lang === 'fr') return publicCar;
    return this.translationsService.applyToEntity(
      publicCar as Record<string, unknown>,
      'car',
      lang,
    );
  }

  async validateDelivery(
    carId: string,
    addressLat: number,
    addressLng: number,
    addressLabel: string,
  ): Promise<{ available: boolean; fee: number | null; address: string; lat: number; lng: number }> {
    const car = await this.repo.findOne({ where: { id: carId } });
    if (!car) throw new NotFoundException(`Car ${carId} not found`);

    if (!car.deliveryEnabled) {
      return { available: false, fee: null, address: addressLabel, lat: addressLat, lng: addressLng };
    }

    if (car.deliveryType === 'radius') {
      if (car.deliveryRadiusKm == null || car.parkingLat == null || car.parkingLng == null) {
        return { available: false, fee: null, address: addressLabel, lat: addressLat, lng: addressLng };
      }
      const dist = haversineKm(addressLat, addressLng, car.parkingLat, car.parkingLng);
      const available = dist <= car.deliveryRadiusKm;
      return {
        available,
        fee: available && car.deliveryRadiusPrice != null ? Number(car.deliveryRadiusPrice) : null,
        address: addressLabel,
        lat: addressLat,
        lng: addressLng,
      };
    }

    if (car.deliveryType === 'location') {
      const locations = await this.deliveryLocationRepo.find({ where: { carId } });
      const match = locations.find(
        loc => haversineKm(addressLat, addressLng, loc.lat, loc.lng) <= loc.radiusKm,
      );
      return {
        available: !!match,
        fee: match?.price != null ? Number(match.price) : null,
        address: addressLabel,
        lat: addressLat,
        lng: addressLng,
      };
    }

    return { available: false, fee: null, address: addressLabel, lat: addressLat, lng: addressLng };
  }

  async searchPublic(dto: SearchCarsDto) {
    const { startDateTime, endDateTime, addressLat, addressLng, lang } = dto;
    const hasAddress = addressLat != null && addressLng != null;

    if (new Date(endDateTime) <= new Date(startDateTime)) {
      throw new BadRequestException('endDateTime must be after startDateTime');
    }

    const startDate = startDateTime.slice(0, 10);
    const endDate   = endDateTime.slice(0, 10);

    // Single query: exclude cars blocked by bookings, active sessions, or availability blocks
    const cars = await this.repo
      .createQueryBuilder('c')
      .where(qb =>
        `c.id NOT IN ${qb
          .subQuery()
          .select('b.carId')
          .from(Booking, 'b')
          .where('b.status NOT IN (:...cancelledStatuses)')
          .andWhere('b.startDateTime < :end')
          .andWhere('b.endDateTime > :start')
          .getQuery()}`,
      )
      .andWhere(qb =>
        `c.id NOT IN ${qb
          .subQuery()
          .select('rs.carId')
          .from(RentSession, 'rs')
          .where('rs.status = :active')
          .getQuery()}`,
      )
      .andWhere(qb =>
        `c.id NOT IN ${qb
          .subQuery()
          .select('va.carId')
          .from('vehicle_availabilities', 'va')
          .where('va.startDate <= :endDate')
          .andWhere('va.endDate >= :startDate')
          .getQuery()}`,
      )
      .setParameters({
        cancelledStatuses: CANCELLED_STATUSES,
        start:             startDateTime,
        end:               endDateTime,
        active:            RentSessionStatus.ACTIVE,
        startDate,
        endDate,
      })
      .getMany();

    // Filter out health-blocking cars
    const blockingHealthIds = await this.vehicleHealthService.getBlockingCarIds();
    const healthFilteredCars = cars.filter(c => !blockingHealthIds.has(c.id));
    const healthMap          = await this.vehicleHealthService.getHealthMap();

    // Load delivery locations for all available cars in one query
    const carIds = healthFilteredCars.map(c => c.id);
    const allLocations = carIds.length
      ? await this.deliveryLocationRepo.find({ where: carIds.map(id => ({ carId: id })) })
      : [];
    const locationsByCarId = new Map<string, CarDeliveryLocation[]>();
    for (const loc of allLocations) {
      (locationsByCarId.get(loc.carId) ?? locationsByCarId.set(loc.carId, []).get(loc.carId)!).push(loc);
    }

    // Build results with distance / delivery eligibility
    const results = healthFilteredCars.map((car) => {
      const distanceKm =
        hasAddress && car.parkingLat != null && car.parkingLng != null
          ? Math.round(haversineKm(addressLat!, addressLng!, car.parkingLat, car.parkingLng) * 10) / 10
          : null;

      let deliveryAvailable = false;

      if (hasAddress && car.deliveryEnabled) {
        if (car.deliveryType === 'radius' && car.deliveryRadiusKm != null && distanceKm != null) {
          deliveryAvailable = distanceKm <= car.deliveryRadiusKm;
        } else if (car.deliveryType === 'location') {
          const locations = locationsByCarId.get(car.id) ?? [];
          deliveryAvailable = locations.some(
            (loc) => haversineKm(addressLat!, addressLng!, loc.lat, loc.lng) <= loc.radiusKm,
          );
        }
      }

      return {
        id:               car.id,
        name:             car.name,
        description:      car.description,
        hasPhoto:         car.photo !== null,
        brand:            car.brand,
        model:            car.model,
        finishing:        car.finishing,
        modelYear:        car.modelYear,
        vehicleType:      car.vehicleType,
        energy:           car.energy,
        gearbox:          car.gearbox,
        din:              car.din,
        mileage:          car.mileage,
        numberOfDoors:    car.numberOfDoors,
        numberOfSeats:    car.numberOfSeats,
        color:            car.color,
        vehicleCondition: car.vehicleCondition,
        basePricePerDay:  car.basePricePerDay,
        parkingAddress:   car.parkingAddress,
        deliveryEnabled:      car.deliveryEnabled,
        deliveryType:         car.deliveryType,
        deliveryRadiusKm:     car.deliveryRadiusKm,
        deliveryRadiusPrice:  car.deliveryRadiusPrice !== null ? Number(car.deliveryRadiusPrice) : null,
        distanceKm,
        deliveryAvailable,
      };
    });

    // Sort: delivery-eligible first, then by distance (nulls last)
    results.sort((a, b) => {
      if (a.deliveryAvailable !== b.deliveryAvailable) return a.deliveryAvailable ? -1 : 1;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });

    if (!lang || lang === 'fr') return results;
    return this.translationsService.applyToEntities(
      results as Record<string, unknown>[],
      'car',
      lang,
    );
  }

  async findAll(): Promise<CarWithRentStatus[]> {
    const cars = await this.repo.find();
    if (cars.length === 0) return [];
    // Single query for all active sessions; derive both sets from the result
    const activeSessions = await this.sessionRepo.find({
      where: { status: RentSessionStatus.ACTIVE },
      select: ['carId', 'trackingPaused'],
    });
    const rentedIds   = new Set(activeSessions.map((s) => s.carId));
    const trackingIds = new Set(activeSessions.filter((s) => !s.trackingPaused).map((s) => s.carId));
    return cars.map((car) =>
      Object.assign(car, {
        isCurrentlyRented: rentedIds.has(car.id),
        isTrackingActive:  trackingIds.has(car.id),
      }),
    );
  }

  async findOne(id: string): Promise<CarWithRentStatus> {
    const car = await this.repo.findOne({ where: { id } });
    if (!car) throw new NotFoundException(`Car ${id} not found`);
    const [rentedCount, trackingCount] = await Promise.all([
      this.sessionRepo.count({ where: { carId: id, status: RentSessionStatus.ACTIVE } }),
      this.sessionRepo.count({ where: { carId: id, status: RentSessionStatus.ACTIVE, trackingPaused: false } }),
    ]);
    return Object.assign(car, { isCurrentlyRented: rentedCount > 0, isTrackingActive: trackingCount > 0 });
  }

  async create(dto: CreateCarDto): Promise<Car> {
    const { deliveryLocations, ...carFields } = dto;
    const car = await this.repo.save(this.repo.create(carFields));
    if (deliveryLocations?.length) {
      await this.syncDeliveryLocations(car.id, deliveryLocations);
    }
    return car;
  }

  async update(id: string, dto: UpdateCarDto): Promise<CarWithRentStatus> {
    await this.findOne(id);
    const { deliveryLocations, ...carFields } = dto;
    await this.repo.update(id, carFields);
    if (deliveryLocations !== undefined) {
      await this.syncDeliveryLocations(id, deliveryLocations ?? []);
    }
    return this.findOne(id);
  }

  private async syncDeliveryLocations(
    carId: string,
    locations: NonNullable<CreateCarDto['deliveryLocations']>,
  ): Promise<void> {
    await this.deliveryLocationRepo.delete({ carId });
    if (locations.length > 0) {
      await this.deliveryLocationRepo.save(
        locations.map(l => this.deliveryLocationRepo.create({ ...l, carId })),
      );
    }
  }

  async getDeliveryLocations(carId: string): Promise<CarDeliveryLocation[]> {
    await this.findOne(carId); // 404 if not found
    return this.deliveryLocationRepo.find({ where: { carId }, order: { createdAt: 'ASC' } });
  }

  async remove(id: string): Promise<void> {
    const car = await this.findOne(id);
    if (car.photo) await this.gcsService.delete(car.photo);
    const photos = await this.photoRepo.find({ where: { carId: id } });
    await Promise.all(photos.map((p) => this.gcsService.delete(p.objectName)));
    await this.repo.delete(id);
  }

  async setPhoto(id: string, file: Express.Multer.File): Promise<CarWithRentStatus> {
    const car = await this.findOne(id);
    if (car.photo) await this.gcsService.delete(car.photo);
    const objectName = `cars/${uuidv4()}${extname(file.originalname)}`;
    await this.gcsService.upload(file.buffer, objectName, file.mimetype);
    await this.repo.update(id, { photo: objectName });
    return this.findOne(id);
  }

  getPhotoUrl(objectName: string): Promise<string> {
    return this.gcsService.signedUrl(objectName);
  }

  async removePhoto(id: string): Promise<CarWithRentStatus> {
    const car = await this.findOne(id);
    if (!car.photo) throw new NotFoundException(`Car ${id} has no photo`);
    await this.gcsService.delete(car.photo);
    await this.repo.update(id, { photo: null });
    return this.findOne(id);
  }

  listPhotos(carId: string): Promise<{ id: string }[]> {
    return this.photoRepo.find({ where: { carId }, select: ['id'], order: { createdAt: 'ASC' } });
  }

  async addPhoto(carId: string, file: Express.Multer.File): Promise<{ id: string }> {
    await this.findOne(carId);
    const objectName = `cars/${carId}/${uuidv4()}${extname(file.originalname)}`;
    await this.gcsService.upload(file.buffer, objectName, file.mimetype);
    const saved = await this.photoRepo.save(this.photoRepo.create({ carId, objectName }));
    return { id: saved.id };
  }

  async getPhotoByIdUrl(carId: string, photoId: string): Promise<string> {
    const photo = await this.photoRepo.findOne({ where: { id: photoId, carId } });
    if (!photo) throw new NotFoundException(`Photo ${photoId} not found`);
    return this.gcsService.signedUrl(photo.objectName);
  }

  async deletePhotoById(carId: string, photoId: string): Promise<void> {
    const photo = await this.photoRepo.findOne({ where: { id: photoId, carId } });
    if (!photo) throw new NotFoundException(`Photo ${photoId} not found`);
    await this.gcsService.delete(photo.objectName);
    await this.photoRepo.delete(photoId);
  }
}
