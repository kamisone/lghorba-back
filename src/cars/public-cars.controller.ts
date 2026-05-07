import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CarsService } from './cars.service';
import { SearchCarsDto, SearchCarsSchema } from './dto/search-cars.dto';
import { ValidateDeliveryDto, ValidateDeliverySchema } from './dto/validate-delivery.dto';

@Controller('public')
export class PublicCarsController {
  constructor(private readonly carsService: CarsService) {}

  @Public()
  @Get('cars')
  findAll(@Query('lang') lang?: string) {
    return this.carsService.findAllPublic(lang);
  }

  @Public()
  @Post('cars/search')
  searchCars(
    @Body(new ZodValidationPipe(SearchCarsSchema)) dto: SearchCarsDto,
  ) {
    return this.carsService.searchPublic(dto);
  }

  @Public()
  @Get('cars/:id')
  findOne(@Param('id') id: string, @Query('lang') lang?: string) {
    return this.carsService.findOnePublic(id, lang);
  }

  @Public()
  @Get('cars/:id/photo')
  async getMainPhoto(@Param('id') id: string, @Res() res: Response) {
    const car = await this.carsService.findOne(id);
    if (!car.photo) throw new NotFoundException(`Car ${id} has no photo`);
    res.redirect(302, await this.carsService.getPhotoUrl(car.photo));
  }

  @Public()
  @Get('cars/:id/photos')
  listPhotos(@Param('id') id: string) {
    return this.carsService.listPhotos(id);
  }

  @Public()
  @Post('cars/:id/delivery/validate')
  validateDelivery(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ValidateDeliverySchema)) dto: ValidateDeliveryDto,
  ) {
    return this.carsService.validateDelivery(id, dto.addressLat, dto.addressLng, dto.addressLabel);
  }

  @Public()
  @Get('cars/:id/photos/:photoId')
  async getPhotoById(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Res() res: Response,
  ) {
    const url = await this.carsService.getPhotoByIdUrl(id, photoId);
    res.redirect(302, url);
  }
}
