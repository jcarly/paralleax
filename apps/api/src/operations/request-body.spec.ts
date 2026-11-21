import { Readable } from 'node:stream';
import { readBinaryRequestBody } from './request-body';

describe('binary request body streaming', () => {
  it('concatenates a complete upload without changing its bytes', async () => {
    const request = Readable.from([Buffer.from([0x00, 0x01, 0x02]), Uint8Array.from([0xfe, 0xff])]);

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
    });

    await expect(readBinaryRequestBody(request)).rejects.toThrow('client aborted upload');
  });

  it('accepts a file exactly at the configured limit', async () => {
    const request = Readable.from([Buffer.from('ab'), Buffer.from('cd')]);
    await expect(readBinaryRequestBody(request, 4)).resolves.toEqual(Buffer.from('abcd'));
  });

  it('rejects a file as soon as its streamed size exceeds the limit', async () => {
    const request = Readable.from([Buffer.from('ab'), Buffer.from('cde')]);
    await expect(readBinaryRequestBody(request, 4)).rejects.toMatchObject({ status: 413 });
  });

  it('rejects an invalid limit', async () => {
    const request = Readable.from([]);
    await expect(readBinaryRequestBody(request, Number.NaN)).rejects.toThrow(RangeError);
  });
});
