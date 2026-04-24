import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRentPositionDto } from './dto/create-rent-position.dto';
import { CreateRentSessionDto } from './dto/create-rent-session.dto';
import { PatchRentSessionDto } from './dto/patch-rent-session.dto';
import { RentPosition } from './rent-position.entity';
import { RentSession, RentSessionStatus } from './rent-session.entity';

const LOCATION_INTERVAL_MS = 15 * 60 * 1000;

export function addLocationInterval(from: Date): Date {
  return new Date(from.getTime() + LOCATION_INTERVAL_MS);
}

@Injectable()
export class RentSessionsService {
  constructor(
    @InjectRepository(RentSession)
    private readonly sessionRepo: Repository<RentSession>,
    @InjectRepository(RentPosition)
    private readonly positionRepo: Repository<RentPosition>,
  ) {}

  create(dto: CreateRentSessionDto): Promise<RentSession> {
    const now = new Date();
    return this.sessionRepo.save(
      this.sessionRepo.create({
        carId: dto.carId,
        scheduleId: dto.scheduleId ?? null,
        trackingPaused: false,
        nextLocationAt: addLocationInterval(now),
      }),
    );
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
    const session = await this.findOne(id);
    if (session.status === RentSessionStatus.ENDED) {
      throw new BadRequestException('Cannot update an ended session');
    }
    const update: Partial<RentSession> = {};
    if (dto.status) {
      update.status = dto.status;
      if (dto.status === RentSessionStatus.ENDED) {
        update.endedAt = new Date();
        update.nextLocationAt = null;
        update.trackingPaused = false;
      }
    }
    if (dto.trackingPaused !== undefined) {
      update.trackingPaused = dto.trackingPaused;
      update.nextLocationAt = dto.trackingPaused
        ? null
        : addLocationInterval(new Date());
    }
    if (dto.lastLocationRequestedAt) {
      const ts = new Date(dto.lastLocationRequestedAt);
      update.lastLocationRequestedAt = ts;
      update.nextLocationAt = addLocationInterval(ts);
    }
    await this.sessionRepo.update(id, update);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const session = await this.findOne(id);
    if (session.status !== RentSessionStatus.ENDED) {
      throw new BadRequestException('Cannot delete an active session');
    }
    await this.sessionRepo.delete(id);
  }

  async addPosition(
    id: string,
    dto: CreateRentPositionDto,
  ): Promise<RentPosition> {
    await this.findOne(id);
    return this.positionRepo.save(
      this.positionRepo.create({ ...dto, sessionId: id }),
    );
  }

  async getPositions(id: string): Promise<RentPosition[]> {
    await this.findOne(id);
    return this.positionRepo.find({
      where: { sessionId: id },
      order: { recordedAt: 'ASC' },
    });
  }
}
