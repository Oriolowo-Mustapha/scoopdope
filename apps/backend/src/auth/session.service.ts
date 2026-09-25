import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class SessionService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly ttlSeconds = 7 * 24 * 60 * 60;

  constructor(configService: ConfigService) {
    this.client = new Redis(configService.get<string>('redis.url')!);
  }

  async create(sessionKey: string, userId: string): Promise<void> {
    await this.client.set(`session:${sessionKey}`, userId, 'EX', this.ttlSeconds);
  }

  async exists(sessionKey: string): Promise<boolean> {
    return (await this.client.exists(`session:${sessionKey}`)) === 1;
  }

  async remove(sessionKey: string): Promise<void> {
    await this.client.del(`session:${sessionKey}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}