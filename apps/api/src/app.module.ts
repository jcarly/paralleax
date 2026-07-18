import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { StoriesModule } from './stories/stories.module';

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule, StoriesModule],
})
export class AppModule {}
