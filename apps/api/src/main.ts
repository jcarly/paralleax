import 'reflect-metadata';
import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { DatabaseMigrator } from './database/database.migrator';
import { MigrationModule } from './database/migration.module';
import { ApiExceptionFilter } from './operations/api-exception.filter';
import { requestContextMiddleware } from './operations/request-context';
import { configureRequestBodyParsing } from './operations/request-body';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(AppConfigService);
  configureRequestBodyParsing(app);
  app.useLogger(new ConsoleLogger({ json: config.nodeEnvironment === 'production' }));
  app.use(requestContextMiddleware);
  app.use(helmet(config.nodeEnvironment === 'production' ? {} : { contentSecurityPolicy: false }));
  app.enableCors({ origin: config.corsOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api');
  if (config.nodeEnvironment !== 'production') {
    const openApi = new DocumentBuilder()
      .setTitle('Paralleax API')
      .setDescription('API for authoring and reading interactive stories.')
      .setVersion('1.0')
      .addCookieAuth('paralleax_session')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, openApi));
  }
  await app.listen(config.port, '::');
}

async function migrate() {
  const app = await NestFactory.createApplicationContext(MigrationModule);
  try {
    await app.get(DatabaseMigrator).run();
  } finally {
    await app.close();
  }
}

void (process.argv.includes('--migrate') ? migrate() : bootstrap());
