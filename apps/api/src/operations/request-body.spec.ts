import { Readable } from 'node:stream';
import type { Request } from 'express';
import { readBinaryRequestBody } from './request-body';

describe('binary request body streaming', () => {
  it('concatenates a complete upload without changing its bytes', async () => {
    const request = Readable.from([
      Buffer.from([0x00, 0x01, 0x02]),
      Uint8Array.from([0xfe, 0xff]),
    ]) as unknown as Request;

    await expect(readBinaryRequestBody(request)).resolves.toEqual(
      Buffer.from([0x00, 0x01, 0x02, 0xfe, 0xff]),
    );
  });

  it('rejects an interrupted upload instead of returning and importing its partial bytes', async () => {
    const request = new Readable({
      read() {
        this.push(Buffer.from('partial QSP payload'));
        this.destroy(new Error('client aborted upload'));
      },
    }) as unknown as Request;

    await expect(readBinaryRequestBody(request)).rejects.toThrow('client aborted upload');
  });
});
