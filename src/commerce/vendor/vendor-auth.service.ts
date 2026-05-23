import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { VendorService } from './vendor.service';
import { ShopVendor } from '../entities/shop-vendor.entity';

export interface VendorTokenPayload {
  sub:   string;
  role:  'vendor';
  email: string;
}

@Injectable()
export class VendorAuthService {
  constructor(
    private readonly vendorService: VendorService,
    private readonly jwtService:   JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string; vendor: Omit<ShopVendor, 'passwordHash'> }> {
    const vendor = await this.vendorService.findByEmail(email);
    if (!vendor) {
      // constant-time rejection
      await new Promise(r => setTimeout(r, 200));
      throw new Error('Invalid credentials');
    }
    await this.vendorService.validatePassword(vendor, password);

    const payload: VendorTokenPayload = { sub: vendor.id, role: 'vendor', email: vendor.email };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '24h' });

    const { passwordHash: _, ...safe } = vendor;
    return { accessToken, vendor: safe as Omit<ShopVendor, 'passwordHash'> };
  }
}
