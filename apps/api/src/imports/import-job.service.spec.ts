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
});
