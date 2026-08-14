import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { StoriesModule } from './stories/stories.module';
import { SecurityModule } from './security/security.module';
import { CommentsModule } from './comments/comments.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    SecurityModule,
    AuthModule,
    StoriesModule,
    CommentsModule,
  ],
})
export class AppModule {}
