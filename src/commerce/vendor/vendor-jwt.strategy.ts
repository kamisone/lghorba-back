import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { VendorTokenPayload } from './vendor-auth.service';

@Injectable()
export class VendorJwtStrategy extends PassportStrategy(Strategy, 'vendor-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: VendorTokenPayload) {
    if (payload.role !== 'vendor') throw new UnauthorizedException();
    return { id: payload.sub, email: payload.email, role: 'vendor' as const };
  }
}
