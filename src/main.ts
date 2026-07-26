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

  // Requests reach the pod through nginx (back/docker/nginx/default.conf, which
  // sets `X-Forwarded-For $proxy_add_x_forwarded_for`) and then the k8s/minikube
  // ingress, which appends again. Without this, `req.ip` is an internal address
  // for every request: geo-IP resolves to null (no country on behaviour events)
  // and IP rate limiting buckets the whole internet into one counter.
  //
  // Trusting private ranges rather than a fixed hop count is deliberate. A
  // numeric count has to match the topology exactly — `1` lands on nginx's own
  // 192.168.x address once the ingress adds a second hop, which is precisely the
  // silent failure this had. Every internal hop here is RFC1918/loopback, so
  // trusting those ranges makes Express walk left past all of them and stop at
  // the first public address: the real client, whatever the cluster does next.
  // A client-forged public prefix still loses, because the trusted hops append
  // the true address to its right.
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

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
