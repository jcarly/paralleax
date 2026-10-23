import { ImportJobService } from './import-job.service';

describe('ImportJobService', () => {
  it('creates a job, streams its initial state, and publishes subsequent updates', () => {
    const service = new ImportJobService();
    const job = service.create('user-1', 'qsp');
    const events: Array<{ type?: string; data?: { status?: string; progress?: number } }> = [];
    const subscription = service.stream('user-1', job.id).subscribe((event) => {
      events.push(event as (typeof events)[number]);
    });

    expect(job).toMatchObject({
      ownerId: 'user-1',
      format: 'qsp',
      status: 'queued',
      phase: 'uploading',
      progress: 0,
      reportAvailable: false,
    });
    expect(job.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    service.update(job.id, { status: 'running', phase: 'parsing', progress: 45, total: 20 });
    service.setStatus(job.id, 'awaiting_confirmation');

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'state',
          data: expect.objectContaining({ status: 'queued' }),
        }),
        expect.objectContaining({
          type: 'state',
          data: expect.objectContaining({ status: 'running', progress: 45 }),
        }),
        expect.objectContaining({
          type: 'state',
          data: expect.objectContaining({ status: 'awaiting_confirmation' }),
        }),
      ]),
    );
    expect(service.get(job.id)).toMatchObject({ status: 'awaiting_confirmation', total: 20 });
    expect(service.update('missing', { status: 'failed' })).toBeUndefined();

    subscription.unsubscribe();
  });

  it('completes an active stream and ignores completion for an unknown job', () => {
    const service = new ImportJobService();
    const job = service.create('user-1', 'choicescript');
    const complete = jest.fn();
    const subscription = service.stream('user-1', job.id).subscribe({ complete });

    service.complete('missing');
    service.complete(job.id);

    expect(complete).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('aborts a running job and prevents later updates or persistence', () => {
    const service = new ImportJobService();
    const job = service.create('user-1', 'qsp');
    const signal = service.getAbortSignal(job.id);
    service.update(job.id, { status: 'running', phase: 'parsing' });

    expect(service.cancel(job.id)).toBe(true);

    expect(signal?.aborted).toBe(true);
    expect(service.beginPersistence(job.id)).toBe(false);
    expect(service.update(job.id, { status: 'completed' })?.status).toBe('cancelled');
    expect(service.get(job.id)?.status).toBe('cancelled');
  });

  it('makes persistence the boundary after which a job cannot be cancelled', () => {
    const service = new ImportJobService();
    const job = service.create('user-1', 'qsp');
    service.update(job.id, { status: 'running', phase: 'parsing' });

    expect(service.beginPersistence(job.id)).toBe(true);
    expect(service.cancel(job.id)).toBe(false);
    expect(service.get(job.id)).toMatchObject({ status: 'running', phase: 'saving' });
  });

  it('closes a stream opened after the job is already terminal', () => {
    const service = new ImportJobService();
    const job = service.create('user-1', 'qsp');
    service.update(job.id, { status: 'completed' });
    const events: Array<{ type?: string; data?: { status?: string } }> = [];
    const complete = jest.fn();

    service.stream('user-1', job.id).subscribe({
      next: (event) => events.push(event as (typeof events)[number]),
      complete,
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: 'state',
        data: expect.objectContaining({ status: 'completed' }),
      }),
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('removes expired terminal metadata while retaining active jobs', () => {
    const service = new ImportJobService();
    const expired = service.create('user-1', 'qsp');
    const active = service.create('user-1', 'qsp');
    service.update(expired.id, { status: 'completed' });
    const now = Date.now() + 8 * 24 * 60 * 60 * 1000;

    expect(service.cleanupExpiredJobs(now)).toBe(1);
    expect(service.get(expired.id)).toBeUndefined();
    expect(service.get(active.id)).toBeDefined();
  });
});
