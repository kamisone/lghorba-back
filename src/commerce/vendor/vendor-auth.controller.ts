import { Body, Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../auth/public.decorator';
import { VendorAuthService } from './vendor-auth.service';
import { VendorService, CreateVendorSchema } from './vendor.service';

const LoginSchema = z.object({ email: z.string().email(), password: z.string() });

@Public()
@Controller('vendor/auth')
export class VendorAuthController {
  constructor(
    private readonly vendorAuthService: VendorAuthService,
    private readonly vendorService:     VendorService,
  ) {}

  @Post('register')
  async register(@Body() body: unknown) {
    const dto = CreateVendorSchema.parse(body);
    const vendor = await this.vendorService.create(dto);
    const { passwordHash: _, ...safe } = vendor;
    return safe;
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown) {
    const { email, password } = LoginSchema.parse(body);
    try {
      return await this.vendorAuthService.login(email, password);
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }
  }
}
