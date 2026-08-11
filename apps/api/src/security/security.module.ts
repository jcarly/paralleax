import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '../config/config.module';
import { OriginGuard } from './origin.guard';

@Module({
  imports: [ConfigModule],
  providers: [{ provide: APP_GUARD, useClass: OriginGuard }],
})
export class SecurityModule {}
