import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ContactsService } from './contacts.service';
import { CreateContactDto, CreateContactSchema } from './dto/create-contact.dto';

@Controller('api/contacts')
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  @Public()
  @Post()
  @HttpCode(201)
  create(@Body(new ZodValidationPipe(CreateContactSchema)) dto: CreateContactDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('limit') limit?: string) {
    return this.service.findAll(limit ? parseInt(limit, 10) : 50);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }
}
