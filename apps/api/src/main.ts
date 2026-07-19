import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);
  app.use(helmet(config.nodeEnvironment === 'production' ? {} : { contentSecurityPolicy: false }));
  app.enableCors({ origin: config.corsOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
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
  await app.listen(config.port);
}
void bootstrap();
