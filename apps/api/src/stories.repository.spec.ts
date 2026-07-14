import type { Story } from '@paralleax/shared';
import { StoriesRepository } from './stories.repository';

function story(id = 'story-1'): Story {
  return {
    id,
    title: 'Repository story',
    interactions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('StoriesRepository', () => {
  it('stores stories and returns cloned lists', () => {
    const repository = new StoriesRepository();
    const saved = story();

    repository.save(saved);
    const listed = repository.list();
    listed[0].title = 'Mutated outside repository';

    expect(repository.find(saved.id)?.title).toBe('Repository story');
  });

  it('deletes stories by id', () => {
    const repository = new StoriesRepository();
    const saved = story();

    repository.save(saved);

    expect(repository.delete(saved.id)).toBe(true);
    expect(repository.find(saved.id)).toBeUndefined();
    expect(repository.delete(saved.id)).toBe(false);
  });
});
