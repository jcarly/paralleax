import type { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';
import type { Request } from 'express';

export const REQUEST_BODY_LIMIT = '128kb';

export function configureRequestBodyParsing(app: INestApplication) {
  app.use(json({ limit: REQUEST_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
}

export async function readBinaryRequestBody(request: Request) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(requestBodyChunk(chunk));
  }
  return Buffer.concat(chunks);
}

function requestBodyChunk(chunk: unknown): Buffer {
  if (typeof chunk === 'string') {
    return Buffer.from(chunk);
  }
  if (Buffer.isBuffer(chunk)) {
    return Buffer.from([...chunk]);
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }
  throw new TypeError('Request body chunks must be strings or byte arrays');
}
