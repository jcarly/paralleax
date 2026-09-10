export {
  appendStoryContextPage,
  createStoryContextAccumulator,
  createStoryLoadingProjection,
  projectStoryContext,
  type StoryContextAccumulator,
} from '@paralleax/shared';

export class StoryProjectionRevisionChangedError extends Error {
  constructor() {
    super('The Story changed while it was loading.');
    this.name = 'StoryProjectionRevisionChangedError';
  }
}

export class StoryProjectionIntegrityError extends Error {
  constructor(detail: string) {
    super(`The Story projection is incomplete: ${detail}`);
    this.name = 'StoryProjectionIntegrityError';
  }
}

export function assertStoryProjectionPage(
  expectedRevision: number | undefined,
  expectedPage: number,
  page: { revision: number; page: number; pageSize: number },
): void {
  if ((expectedRevision ?? 1) !== page.revision) {
    throw new StoryProjectionRevisionChangedError();
  }
  if (page.page !== expectedPage) {
    throw new StoryProjectionIntegrityError(
      `requested page ${expectedPage} but received page ${page.page}.`,
    );
  }
  if (!Number.isInteger(page.pageSize) || page.pageSize <= 0) {
    throw new StoryProjectionIntegrityError(`page ${page.page} has an invalid page size.`);
  }
}

export function assertStoryProjectionIds(
  label: string,
  ids: readonly string[],
  expectedCount: number,
  expectedIds?: ReadonlySet<string>,
): void {
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    throw new StoryProjectionIntegrityError(`${label} contains duplicate identifiers.`);
  }
  if (ids.length !== expectedCount) {
    throw new StoryProjectionIntegrityError(
      `${label} returned ${ids.length} of ${expectedCount} expected records.`,
    );
  }
  if (expectedIds && [...uniqueIds].some((id) => !expectedIds.has(id))) {
    throw new StoryProjectionIntegrityError(`${label} contains an unknown identifier.`);
  }
}
