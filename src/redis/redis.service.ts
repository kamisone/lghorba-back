import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private _client: Redis;

  onModuleInit(): void {
    this._client = new Redis({
      host:     process.env.REDIS_HOST     ?? 'localhost',
      port:     Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD ?? undefined,
      db:       Number(process.env.REDIS_DB   ?? 0),
      // Exponential back-off capped at 2 s, giving up after ~16 retries
      retryStrategy: (times) => (times > 16 ? null : Math.min(times * 50, 2000)),
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: 5_000,
    });

    this._client.on('connect',           ()  => this.logger.log('Redis connected'));
    this._client.on('ready',             ()  => this.logger.log('Redis ready'));
    this._client.on('reconnecting',      ()  => this.logger.warn('Redis reconnecting…'));
    this._client.on('error',             (e) => this.logger.error('Redis error', e?.message));
  }

  async onModuleDestroy(): Promise<void> {
    await this._client?.quit();
  }

  /** Raw ioredis client for advanced use (Lua eval, pipelines, etc.) */
  get client(): Redis { return this._client; }
}
