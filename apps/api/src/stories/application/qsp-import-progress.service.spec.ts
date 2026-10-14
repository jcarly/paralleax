import { ForbiddenException } from '@nestjs/common';

import { QspImportProgressService } from './qsp-import-progress.service';

describe('QspImportProgressService', () => {
  it('streams progress only to the user who opened the channel', () => {
    const service = new QspImportProgressService();
    const events: Array<{ type?: string; data?: unknown }> = [];
    const subscription = service
      .stream('user-1', 'progress-1')
      .subscribe((event) => events.push(event));

    service.publish('user-2', 'progress-1', {
      phase: 'decoding',
      completed: 1,
      total: 2,
    });
    service.publish('user-1', 'progress-1', {
      phase: 'parsing',
      completed: 2,
      total: 2,
      currentFile: 'start.qsps',
    });

    expect(events).toEqual([
      { type: 'ready', retry: 3_000, data: { progressId: 'progress-1' } },
      {
        type: 'progress',
        data: {
          phase: 'parsing',
          completed: 2,
          total: 2,
          currentFile: 'start.qsps',
        },
      },
    ]);

    subscription.unsubscribe();
  });

  it('rejects a stream identifier already opened by another user', () => {
    const service = new QspImportProgressService();
    const subscription = service.stream('user-1', 'progress-1').subscribe();

    expect(() => service.stream('user-2', 'progress-1')).toThrow(ForbiddenException);

    subscription.unsubscribe();
  });

  it('completes and removes the channel once the import is finished', () => {
    const service = new QspImportProgressService();
    const complete = jest.fn();
    const subscription = service.stream('user-1', 'progress-1').subscribe({ complete });

    service.complete('user-1', 'progress-1');

    expect(complete).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });
});
