import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { config } from 'dotenv';

config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: '*' });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.BACK_PORT || 3000);
}
bootstrap();
