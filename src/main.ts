import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import * as bodyParser from 'body-parser';

config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.use(bodyParser.json({ type: ['application/json', 'text/plain'] }));
  app.enableCors({ origin: '*' });
  await app.listen(process.env.BACK_PORT || 3000);
}
bootstrap();
