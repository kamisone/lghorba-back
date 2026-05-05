import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { extname } from 'path';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Booking, BookingStatus } from '../bookings/booking.entity';
import { GcsService } from '../gcs/gcs.service';
import { RentSession, RentSessionStatus } from '../rent-sessions/rent-session.entity';
import { TranslationsService } from '../translations/translations.service';
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
    private readonly gcsService: GcsService,
    private readonly translationsService: TranslationsService,
  ) {}

  async findAllPublic(lang?: string) {
    const cars = await this.findAll();
    const publicCars = cars.map((car) => ({
      id: car.id,
      name: car.name,
      description: car.description,
      hasPhoto: car.photo !== null,
      isAvailable: !car.isCurrentlyRented,
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
    }));
    if (!lang || lang === 'fr') return publicCars;
    return this.translationsService.applyToEntities(
      publicCars as Record<string, unknown>[],
      'car',
      lang,
    );
  }

  async findOnePublic(id: string, lang?: string) {
    const car = await this.findOne(id);
    const { immatriculation, phoneNumber, photo, ...rest } = car;
    const publicCar = { ...rest, hasPhoto: photo !== null };
    if (!lang || lang === 'fr') return publicCar;
    return this.translationsService.applyToEntity(
      publicCar as Record<string, unknown>,
      'car',
      lang,
    );
  }

  async searchPublic(dto: SearchCarsDto) {
    const { startDateTime, endDateTime, addressLat, addressLng } = dto;
    const hasAddress = addressLat != null && addressLng != null;

    if (new Date(endDateTime) <= new Date(startDateTime)) {
      throw new BadRequestException('endDateTime must be after startDateTime');
    }

    // Single query: exclude cars with overlapping bookings OR active rent sessions
    const cars = await this.repo
      .createQueryBuilder('c')
      .where(qb =>
        `c.id NOT IN ${qb
          .subQuery()
          .select('b.carId')
          .from(Booking, 'b')
          .where('b.status != :cancelled')
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
      .setParameters({
        cancelled: BookingStatus.CANCELLED,
        start:     startDateTime,
        end:       endDateTime,
        active:    RentSessionStatus.ACTIVE,
      })
      .getMany();

    // Build results with distance / delivery info
    const results = cars
      .map((car) => {
        const distanceKm =
          hasAddress && car.parkingLat != null && car.parkingLng != null
            ? Math.round(haversineKm(addressLat!, addressLng!, car.parkingLat, car.parkingLng) * 10) / 10
            : null;

        let deliveryAvailable = false;
        let deliveryNote: string | null = null;

        if (hasAddress) {
          if (car.deliveryType === 'radius' && car.deliveryRadiusKm != null && distanceKm != null) {
            deliveryAvailable = distanceKm <= car.deliveryRadiusKm;
            deliveryNote = deliveryAvailable
              ? `Livraison disponible (rayon ${car.deliveryRadiusKm} km)`
              : `Retrait sur place (rayon livraison : ${car.deliveryRadiusKm} km)`;
          } else if (car.deliveryType === 'whitelist' && car.deliveryAddresses) {
            deliveryAvailable = car.deliveryAddresses.some(
              (a) => haversineKm(addressLat!, addressLng!, a.lat, a.lng) < 0.5,
            );
            deliveryNote = deliveryAvailable
              ? 'Livraison disponible à votre adresse'
              : 'Livraison à des adresses spécifiques uniquement';
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
          deliveryType:     car.deliveryType ?? 'none',
          deliveryRadiusKm: car.deliveryRadiusKm,
          distanceKm,
          deliveryAvailable,
          deliveryNote,
        };
      });

    // Sort: delivery-eligible first, then by distance (nulls last)
    results.sort((a, b) => {
      if (a.deliveryAvailable !== b.deliveryAvailable) return a.deliveryAvailable ? -1 : 1;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });

    return results;
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

  create(dto: CreateCarDto): Promise<Car> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateCarDto): Promise<CarWithRentStatus> {
    await this.findOne(id);
    await this.repo.update(id, dto);
    return this.findOne(id);
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
