import { type ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigService } from '../config/app-config.service';
import { ConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';
import { SessionGuard } from './auth.guard';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => [
        {
          ttl: 60_000,
          limit: (context: ExecutionContext) =>
            authRateLimit(context, config.authRegistrationRateLimit),
        },
      ],
    }),
  ],
  controllers: [AuthController, AdminController],
  providers: [
    AuthRepository,
    AuthService,
    SessionGuard,
    { provide: APP_GUARD, useExisting: SessionGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AuthModule {}

function authRateLimit(context: ExecutionContext, registrationLimit: number) {
  const handler = context.getHandler();
  if (handler === AuthController.prototype.register) return registrationLimit;
  if (handler === AuthController.prototype.login) return 10;
  return 100;
}
