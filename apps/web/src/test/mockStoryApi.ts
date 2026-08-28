import { vi, type Mock } from 'vitest';

type StoryApiKey = keyof typeof import('../api').api;
type StoryApiMock = Partial<Record<StoryApiKey, Mock>>;

export function createStoryApiMock() {
  return {
    getStory: vi.fn(),
    getReaderProgress: vi.fn(),
    saveReaderProgress: vi.fn(),
    deleteReaderProgress: vi.fn(),
    listReaderSaves: vi.fn(),
    getReaderSave: vi.fn(),
    createReaderSave: vi.fn(),
    updateReaderSave: vi.fn(),
    deleteReaderSave: vi.fn(),
    createInteraction: vi.fn(),
    updateInteraction: vi.fn(),
    deleteInteraction: vi.fn(),
    createGraphDecoration: vi.fn(),
    updateGraphDecoration: vi.fn(),
    deleteGraphDecoration: vi.fn(),
    renameStory: vi.fn(),
    updateStory: vi.fn(),
    addTrigger: vi.fn(),
    updateTrigger: vi.fn(),
    deleteTrigger: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    createCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    createStatDefinition: vi.fn(),
    updateStatDefinition: vi.fn(),
    createItemDefinition: vi.fn(),
    updateItemDefinition: vi.fn(),
    createCharacterStat: vi.fn(),
    updateCharacterStat: vi.fn(),
    createCharacterItem: vi.fn(),
    listCommentThreads: vi.fn(),
    createCommentThread: vi.fn(),
    addCommentMessage: vi.fn(),
    updateCommentThreadStatus: vi.fn(),
    updateCommentThreadAnchor: vi.fn(),
  } satisfies StoryApiMock;
}
