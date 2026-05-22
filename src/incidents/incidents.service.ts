import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Incident, IncidentSeverity, IncidentType } from './entities/incident.entity';
import { IncidentPhoto } from './entities/incident-photo.entity';
import { GcsService } from '../gcs/gcs.service';
import { AssetUrlService } from '../asset-url/asset-url.service';
import { VehicleHealthService } from '../vehicle-health/vehicle-health.service';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepo: Repository<Incident>,
    @InjectRepository(IncidentPhoto)
    private readonly photoRepo: Repository<IncidentPhoto>,
    private readonly gcsService: GcsService,
    private readonly assetUrlService: AssetUrlService,
    private readonly healthService: VehicleHealthService,
  ) {}

  async findAll(filters: {
    carId?: string; type?: IncidentType; from?: string; to?: string;
  }): Promise<Incident[]> {
    const qb = this.incidentRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.photos', 'p')
      .orderBy('i.reportedAt', 'DESC');

    if (filters.carId) qb.andWhere('i.carId = :carId', { carId: filters.carId });
    if (filters.type)  qb.andWhere('i.incidentType = :type', { type: filters.type });
    if (filters.from)  qb.andWhere('i.reportedAt >= :from', { from: filters.from });
    if (filters.to)    qb.andWhere('i.reportedAt <= :to',   { to: filters.to });

    return qb.getMany();
  }

  async findOne(id: string): Promise<Incident> {
    const i = await this.incidentRepo.findOne({ where: { id }, relations: ['photos'] });
    if (!i) throw new NotFoundException(`Incident ${id} not found`);
    return i;
  }

  async create(dto: {
    carId: string; incidentType: IncidentType; severity: IncidentSeverity;
    reportedAt: string; description: string; repairRequired?: boolean;
    bookingId?: string; inspectionId?: string;
  }): Promise<Incident> {
    const incident = await this.incidentRepo.save(
      this.incidentRepo.create({
        carId:           dto.carId,
        incidentType:    dto.incidentType,
        severity:        dto.severity,
        reportedAt:      new Date(dto.reportedAt),
        description:     dto.description,
        repairRequired:  dto.repairRequired ?? false,
        bookingId:       dto.bookingId ?? null,
        inspectionId:    dto.inspectionId ?? null,
      }),
    );

    // Update vehicle health based on severity
    if (dto.severity === 'major') {
      await this.healthService.setHealth(
        dto.carId, 'critical',
        `Major incident reported: ${dto.description.slice(0, 100)}`,
      );
    } else if (dto.severity === 'moderate') {
      const current = await this.healthService.getHealthStatus(dto.carId);
      if (current === 'healthy' || current === 'warning') {
        await this.healthService.setHealth(
          dto.carId, 'needs_service',
          `Moderate incident reported: ${dto.description.slice(0, 100)}`,
        );
      }
    }

    return this.findOne(incident.id);
  }

  async update(id: string, dto: Partial<{
    severity: IncidentSeverity; description: string;
    repairRequired: boolean; maintenanceRecordId: string | null;
  }>): Promise<Incident> {
    const incident = await this.findOne(id);
    Object.assign(incident, dto);
    return this.incidentRepo.save(incident);
  }

  async addPhoto(
    incidentId: string,
    file: Express.Multer.File,
    caption?: string,
  ): Promise<{ id: string; url: string }> {
    const incident = await this.incidentRepo.findOne({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);

    const objectName = `vehicles/${incident.carId}/incidents/${incidentId}/${uuidv4()}${extname(file.originalname)}`;
    await this.gcsService.upload(file.buffer, objectName, file.mimetype);

    const photo = await this.photoRepo.save(
      this.photoRepo.create({ incidentId, gcsObjectName: objectName, caption: caption ?? null }),
    );

    const url = await this.assetUrlService.resolve(objectName);
    return { id: photo.id, url };
  }

  async getPhotoUrl(photoId: string): Promise<string> {
    const photo = await this.photoRepo.findOne({ where: { id: photoId } });
    if (!photo) throw new NotFoundException(`IncidentPhoto ${photoId} not found`);
    return this.assetUrlService.resolve(photo.gcsObjectName);
  }

  async removePhoto(photoId: string): Promise<void> {
    const photo = await this.photoRepo.findOne({ where: { id: photoId } });
    if (!photo) throw new NotFoundException(`IncidentPhoto ${photoId} not found`);
    await this.gcsService.delete(photo.gcsObjectName);
    await this.assetUrlService.invalidate(photo.gcsObjectName);
    await this.photoRepo.delete(photoId);
  }

  async remove(id: string): Promise<void> {
    const incident = await this.incidentRepo.findOne({ where: { id }, relations: ['photos'] });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);
    await Promise.all((incident.photos ?? []).map(p => this.gcsService.delete(p.gcsObjectName)));
    await this.incidentRepo.delete(id);
  }
}
