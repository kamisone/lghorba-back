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
