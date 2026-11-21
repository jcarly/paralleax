import { PayloadTooLargeException, type INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';

export const REQUEST_BODY_LIMIT = '128kb';

export function configureRequestBodyParsing(app: INestApplication) {
  app.use(json({ limit: REQUEST_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
}

export async function readBinaryRequestBody(request: AsyncIterable<unknown>, maxBytes?: number) {
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) {
    throw new RangeError('The request body limit must be a non-negative safe integer');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = requestBodyChunk(chunk);
    size += bytes.byteLength;
    if (maxBytes !== undefined && size > maxBytes) {
      throw new PayloadTooLargeException('The uploaded file exceeds the allowed size');
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

function requestBodyChunk(chunk: unknown): Buffer {
  if (typeof chunk === 'string') {
    return Buffer.from(chunk);
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }
  throw new TypeError('Request body chunks must be strings or byte arrays');
}
