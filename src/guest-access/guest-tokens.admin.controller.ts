import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UsePipes,
} from '@nestjs/common';
import { Request } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateGuestTokenDto, CreateGuestTokenSchema } from './dto/create-guest-token.dto';
import { GuestTokenService } from './guest-token.service';

interface AdminJwtPayload {
  id: string;
  email: string;
}

@Controller('admin/guest-tokens')
export class GuestTokensAdminController {
  constructor(private readonly guestTokenService: GuestTokenService) {}

  @Post()
  @UsePipes(new ZodValidationPipe(CreateGuestTokenSchema))
  async create(@Body() dto: CreateGuestTokenDto, @Req() req: Request & { user: AdminJwtPayload }) {
    const { token, rawToken } = await this.guestTokenService.create(dto, req.user.id);
    return { ...token, rawToken };
  }

  @Get()
  findAll() {
    return this.guestTokenService.findAllByAdmin();
  }

  @Delete(':id/revoke')
  revoke(@Param('id') id: string, @Req() req: Request & { user: AdminJwtPayload }) {
    return this.guestTokenService.revoke(id, req.user.id);
  }

  @Get('audit')
  getAudit(@Query('tokenId') tokenId?: string) {
    return this.guestTokenService.findAuditLogs(tokenId);
  }
}
