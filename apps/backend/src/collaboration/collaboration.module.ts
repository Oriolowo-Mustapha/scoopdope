import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PresenceService } from './presence.service';
import { CollaborationGateway } from './collaboration.gateway';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
  providers: [PresenceService, CollaborationGateway],
  exports: [PresenceService, CollaborationGateway],
})
export class CollaborationModule {}
