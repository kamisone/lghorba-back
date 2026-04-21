import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRentPositionDto } from './dto/create-rent-position.dto';
import { CreateRentSessionDto } from './dto/create-rent-session.dto';
import { PatchRentSessionDto } from './dto/patch-rent-session.dto';
import { RentPosition } from './rent-position.entity';
import { RentSession, RentSessionStatus } from './rent-session.entity';

@Injectable()
export class RentSessionsService {
  constructor(
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
    @InjectRepository(RentPosition)
    private readonly positionRepo: Repository<RentPosition>,
  ) {}

  create(dto: CreateRentSessionDto): Promise<RentSession> {
    return this.sessionRepo.save(this.sessionRepo.create({ carId: dto.carId }));
  }

  findAllForCar(carId: string): Promise<RentSession[]> {
    return this.sessionRepo.find({
      where: { carId },
      relations: { positions: true },
      order: { startedAt: 'DESC', positions: { recordedAt: 'ASC' } },
    });
  }

  async findOne(id: string): Promise<RentSession> {
    const session = await this.sessionRepo.findOne({
      where: { id },
      relations: { positions: true },
      order: { positions: { recordedAt: 'ASC' } },
    });
    if (!session) throw new NotFoundException(`RentSession ${id} not found`);
    return session;
  }

  async patch(id: string, dto: PatchRentSessionDto): Promise<RentSession> {
    await this.findOne(id);
    const update: Partial<RentSession> = { status: dto.status };
    if (dto.status === RentSessionStatus.ENDED) update.endedAt = new Date();
    await this.sessionRepo.update(id, update);
    return this.findOne(id);
  }

  async addPosition(id: string, dto: CreateRentPositionDto): Promise<RentPosition> {
    await this.findOne(id);
    return this.positionRepo.save(this.positionRepo.create({ ...dto, sessionId: id }));
  }

  async getPositions(id: string): Promise<RentPosition[]> {
    await this.findOne(id);
    return this.positionRepo.find({
      where: { sessionId: id },
      order: { recordedAt: 'ASC' },
    });
  }
}
