import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { AuthController } from './auth.controller';
import { SessionGuard } from './auth.guard';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    SessionGuard,
    { provide: APP_GUARD, useExisting: SessionGuard },
  ],
})
export class AuthModule {}
