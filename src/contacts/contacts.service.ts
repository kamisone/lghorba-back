import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateContactDto } from './dto/create-contact.dto';
import { Contact } from './contact.entity';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly repo: Repository<Contact>,
  ) {}

  create(dto: CreateContactDto): Promise<Contact> {
    return this.repo.save(this.repo.create(dto));
  }

  findAll(limit = 50): Promise<Contact[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async markRead(id: string): Promise<Contact> {
    const contact = await this.repo.findOne({ where: { id } });
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);
    contact.read = true;
    return this.repo.save(contact);
  }
}
