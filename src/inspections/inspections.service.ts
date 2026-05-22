import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Inspection, InspectionType } from './entities/inspection.entity';
import { InspectionChecklistItem } from './entities/inspection-checklist-item.entity';
import { InspectionPhoto } from './entities/inspection-photo.entity';
import { GcsService } from '../gcs/gcs.service';
import { AssetUrlService } from '../asset-url/asset-url.service';

@Injectable()
export class InspectionsService {
  constructor(
    @InjectRepository(Inspection)
    private readonly inspectionRepo: Repository<Inspection>,
    @InjectRepository(InspectionChecklistItem)
    private readonly itemRepo: Repository<InspectionChecklistItem>,
    @InjectRepository(InspectionPhoto)
    private readonly photoRepo: Repository<InspectionPhoto>,
    private readonly gcsService: GcsService,
    private readonly assetUrlService: AssetUrlService,
  ) {}

  async findAll(filters: {
    carId?: string; type?: InspectionType; bookingId?: string;
    from?: string; to?: string;
  }): Promise<Inspection[]> {
    const qb = this.inspectionRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.checklistItems', 'ci')
      .orderBy('i.conductedAt', 'DESC');

    if (filters.carId)     qb.andWhere('i.carId = :carId',             { carId: filters.carId });
    if (filters.type)      qb.andWhere('i.inspectionType = :type',     { type: filters.type });
    if (filters.bookingId) qb.andWhere('i.bookingId = :bookingId',     { bookingId: filters.bookingId });
    if (filters.from)      qb.andWhere('i.conductedAt >= :from',       { from: filters.from });
    if (filters.to)        qb.andWhere('i.conductedAt <= :to',         { to: filters.to });

    return qb.getMany();
  }

  async findOne(id: string): Promise<Inspection> {
    const inspection = await this.inspectionRepo.findOne({
      where: { id },
      relations: ['checklistItems', 'photos'],
    });
    if (!inspection) throw new NotFoundException(`Inspection ${id} not found`);
    return inspection;
  }

  async create(dto: {
    carId: string; inspectionType: InspectionType; conductedAt: string;
    bookingId?: string; conductedBy?: string; odometerKm?: number;
    fuelLevelPct?: number; overallCondition?: string; notes?: string;
    checklistItems?: Array<{ category: string; itemLabel: string; status?: string; note?: string; sortOrder?: number }>;
  }): Promise<Inspection> {
    const inspection = await this.inspectionRepo.save(
      this.inspectionRepo.create({
        carId:            dto.carId,
        inspectionType:   dto.inspectionType,
        conductedAt:      new Date(dto.conductedAt),
        bookingId:        dto.bookingId ?? null,
        conductedBy:      dto.conductedBy ?? null,
        odometerKm:       dto.odometerKm ?? null,
        fuelLevelPct:     dto.fuelLevelPct ?? null,
        overallCondition: (dto.overallCondition as any) ?? null,
        notes:            dto.notes ?? null,
      }),
    );

    if (dto.checklistItems?.length) {
      await this.itemRepo.save(
        dto.checklistItems.map((item, idx) =>
          this.itemRepo.create({
            inspectionId: inspection.id,
            category:     item.category,
            itemLabel:    item.itemLabel,
            status:       (item.status as any) ?? 'not_checked',
            note:         item.note ?? null,
            sortOrder:    item.sortOrder ?? idx,
          }),
        ),
      );
    }

    return this.findOne(inspection.id);
  }

  async addPhoto(
    inspectionId: string,
    file: Express.Multer.File,
    caption?: string,
  ): Promise<{ id: string; url: string }> {
    const inspection = await this.inspectionRepo.findOne({ where: { id: inspectionId } });
    if (!inspection) throw new NotFoundException(`Inspection ${inspectionId} not found`);

    const objectName = `vehicles/${inspection.carId}/inspections/${inspectionId}/${uuidv4()}${extname(file.originalname)}`;
    await this.gcsService.upload(file.buffer, objectName, file.mimetype);

    const photo = await this.photoRepo.save(
      this.photoRepo.create({ inspectionId, gcsObjectName: objectName, caption: caption ?? null }),
    );

    const url = await this.assetUrlService.resolve(objectName);
    return { id: photo.id, url };
  }

  async getPhotoUrl(photoId: string): Promise<string> {
    const photo = await this.photoRepo.findOne({ where: { id: photoId } });
    if (!photo) throw new NotFoundException(`InspectionPhoto ${photoId} not found`);
    return this.assetUrlService.resolve(photo.gcsObjectName);
  }

  async removePhoto(photoId: string): Promise<void> {
    const photo = await this.photoRepo.findOne({ where: { id: photoId } });
    if (!photo) throw new NotFoundException(`InspectionPhoto ${photoId} not found`);
    await this.gcsService.delete(photo.gcsObjectName);
    await this.assetUrlService.invalidate(photo.gcsObjectName);
    await this.photoRepo.delete(photoId);
  }

  async remove(id: string): Promise<void> {
    const inspection = await this.inspectionRepo.findOne({
      where: { id },
      relations: ['photos'],
    });
    if (!inspection) throw new NotFoundException(`Inspection ${id} not found`);

    // Delete GCS objects first
    await Promise.all(
      (inspection.photos ?? []).map(p => this.gcsService.delete(p.gcsObjectName)),
    );

    await this.inspectionRepo.delete(id);
  }
}
