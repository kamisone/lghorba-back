import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ErrorCollectorService } from './common/error-collector/error-collector.service';
import { config } from 'dotenv';

config();

async function bootstrap() {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) ?? [];
  if (allowedOrigins.length === 0) {
    console.error('FATAL: ALLOWED_ORIGINS env var is required and must not be empty');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });

  // The API runs behind one reverse proxy, so the socket peer is the proxy, not
  // the visitor. Without this, `req.ip` is the proxy's private address for every
  // request: geo-IP lookups resolve to null (no country on behaviour events) and
  // IP rate limiting buckets the whole world into a single counter. Trusting
  // exactly one hop makes Express read the last entry of `x-forwarded-for`, which
  // the proxy controls — raise the count only if another proxy is added, since a
  // too-high value lets clients spoof the header.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.useLogger(app.get(Logger));
  app.enableCors({
    origin:      allowedOrigins,
    credentials: true,
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.useGlobalFilters(new AllExceptionsFilter(app.get(ErrorCollectorService)));
  await app.listen(process.env.BACK_PORT || 3000);
}
bootstrap();
