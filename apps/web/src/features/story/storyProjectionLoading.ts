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
