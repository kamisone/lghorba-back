import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateUserDto, CreateUserSchema } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserSchema } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('minRents') minRents?: string,
    @Query('maxRents') maxRents?: string,
    @Query('minScore') minScore?: string,
    @Query('maxScore') maxScore?: string,
    @Query('joinedFrom') joinedFrom?: string,
    @Query('joinedTo') joinedTo?: string,
    @Query('rentFrom') rentFrom?: string,
    @Query('rentTo') rentTo?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const toInt = (v?: string) => (v !== undefined && v !== '' ? parseInt(v, 10) : undefined);
    return this.usersService.findAll({
      search,
      limit: limit ? parseInt(limit, 10) : 100,
      minRents: toInt(minRents),
      maxRents: toInt(maxRents),
      minScore: toInt(minScore),
      maxScore: toInt(maxScore),
      joinedFrom,
      joinedTo,
      rentFrom,
      rentTo,
      activeOnly: activeOnly === '1',
    });
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  patch(@Param('id') id: string, @Body(new ZodValidationPipe(UpdateUserSchema)) dto: UpdateUserDto) {
    return this.usersService.patch(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
