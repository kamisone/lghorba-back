import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { CarsService } from './cars.service';

@Controller('api/public')
export class PublicCarsController {
  constructor(private readonly carsService: CarsService) {}

  @Public()
  @Get('cars')
  findAll() {
    return this.carsService.findAllPublic();
  }

  @Public()
  @Get('cars/:id/photo')
  async getPhoto(@Param('id') id: string, @Res() res: Response) {
    const car = await this.carsService.findOne(id);
    if (!car.photo) throw new NotFoundException(`Car ${id} has no photo`);
    res.redirect(302, await this.carsService.getPhotoUrl(car.photo));
  }
}
