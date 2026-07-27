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

  // console.*, not the Nest logger: `bufferLogs` holds every logged line until
  // useLogger() below, so anything that hangs or throws inside
  // NestFactory.create produces a completely silent pod — the npm banner and
  // nothing else. These lines bypass the buffer.
  console.log('[boot] creating Nest application (DB connect + migrations)…');

  // NestFactory.create can block indefinitely rather than fail: a migration
  // waiting on an ACCESS EXCLUSIVE table lock held by another pod never times
  // out. Name the likely cause instead of leaving an empty log.
  const watchdog = setTimeout(() => {
    console.error(
      '[boot] still starting after 60s — most likely a pending migration is ' +
        'blocked on a table lock, or the database is unreachable. Check ' +
        'pg_stat_activity for a waiting ALTER/CREATE INDEX statement.',
    );
  }, 60_000);
  watchdog.unref?.();

  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  clearTimeout(watchdog);
  console.log('[boot] Nest application created');

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
  const port = process.env.BACK_PORT || 3000;
  await app.listen(port);
  console.log(`[boot] listening on ${port}`);
}

// Without this an unhandled rejection can leave the container "running" with an
// empty log while the service has no endpoints. Fail loudly and exit so the
// orchestrator restarts it and the reason is on stdout.
bootstrap().catch((err) => {
  console.error('[boot] FAILED to start:', err);
  process.exit(1);
});
