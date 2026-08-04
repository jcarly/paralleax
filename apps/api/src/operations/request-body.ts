import type { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';

export const REQUEST_BODY_LIMIT = '128kb';

export function configureRequestBodyParsing(app: INestApplication) {
  app.use(json({ limit: REQUEST_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
}
