import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { Admin, AdminRole } from './admin.entity';

type PublicAdmin = Omit<Admin, 'password'>;

@Injectable()
export class AdminsService implements OnModuleInit {
  constructor(
    @InjectRepository(Admin)
    private readonly repo: Repository<Admin>,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.repo.count();
    if (count === 0) {
      const email = process.env.ADMIN_EMAIL;
      const password = process.env.ADMIN_PASSWORD;
      if (email && password) {
        await this.repo.save(
          this.repo.create({
            name: 'Admin',
            email,
            password: await bcrypt.hash(password, 10),
            role: AdminRole.SUPERADMIN,
          }),
        );
      }
    }
  }

  async findByEmail(email: string): Promise<Admin | null> {
    return this.repo.findOne({ where: { email } });
  }

  async findAll(): Promise<PublicAdmin[]> {
    const admins = await this.repo.find({ order: { createdAt: 'ASC' } });
    return admins.map(this.toPublic);
  }

  async create(dto: CreateAdminDto): Promise<PublicAdmin> {
    const existing = await this.repo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException(`Email ${dto.email} is already taken`);
    const admin = await this.repo.save(
      this.repo.create({
        name: dto.name,
        email: dto.email,
        password: await bcrypt.hash(dto.password, 10),
        role: dto.role ?? AdminRole.ADMIN,
      }),
    );
    return this.toPublic(admin);
  }

  async findOne(id: string): Promise<PublicAdmin> {
    const admin = await this.repo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException(`Admin ${id} not found`);
    return this.toPublic(admin);
  }

  async patch(id: string, dto: UpdateAdminDto): Promise<PublicAdmin> {
    const admin = await this.repo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException(`Admin ${id} not found`);
    if (dto.email && dto.email !== admin.email) {
      const taken = await this.repo.findOne({ where: { email: dto.email } });
      if (taken) throw new ConflictException(`Email ${dto.email} is already taken`);
    }
    if (dto.name !== undefined) admin.name = dto.name;
    if (dto.email !== undefined) admin.email = dto.email;
    if (dto.role !== undefined) admin.role = dto.role;
    return this.toPublic(await this.repo.save(admin));
  }

  async remove(id: string): Promise<{ ok: true }> {
    const admin = await this.repo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException(`Admin ${id} not found`);
    await this.repo.delete(id);
    return { ok: true };
  }

  async resetPassword(id: string, dto: ResetPasswordDto): Promise<{ ok: true }> {
    const admin = await this.repo.findOne({ where: { id } });
    if (!admin) throw new NotFoundException(`Admin ${id} not found`);
    admin.password = await bcrypt.hash(dto.password, 10);
    await this.repo.save(admin);
    return { ok: true };
  }

  private toPublic(admin: Admin): PublicAdmin {
    const { password: _, ...rest } = admin;
    return rest;
  }
}
