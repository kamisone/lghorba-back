import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ErrorCollectorService } from './common/error-collector/error-collector.service';
import { config } from 'dotenv';

config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors({ origin: '*' });
  app.useGlobalFilters(new AllExceptionsFilter(app.get(ErrorCollectorService)));
  await app.listen(process.env.BACK_PORT || 3000);
}
bootstrap();
