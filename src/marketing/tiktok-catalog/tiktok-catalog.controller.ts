import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { TikTokCatalogService } from './tiktok-catalog.service';

@Public()
@Controller('public/shop/tiktok-catalog')
export class TikTokCatalogController {
  constructor(private readonly catalog: TikTokCatalogService) {}

  /** URL to register as the "Data feed" source in TikTok Catalog Manager. */
  @Get('feed.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  async feed(@Res({ passthrough: true }) res: Response): Promise<string> {
    // Feed changes only when products are edited/restocked — TikTok also
    // re-crawls on its own schedule, so a short cache is enough to absorb
    // repeat crawler hits without serving stale data for long.
    res.setHeader('Cache-Control', 'public, max-age=1800');
    return this.catalog.generateFeedXml();
  }
}
