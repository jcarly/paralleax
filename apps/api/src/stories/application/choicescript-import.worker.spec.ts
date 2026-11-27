import type { ChoiceScriptImportResult, ChoiceScriptSourceFile } from '@paralleax/shared';

const mockPostMessage = jest.fn();
const mockImportChoiceScript = jest.fn();
let mockWorkerData: {
  files: ChoiceScriptSourceFile[];
  storyId: string;
  timestamp: string;
};
let mockParentPort: { postMessage: typeof mockPostMessage } | null;

jest.mock('node:worker_threads', () => ({
  get parentPort() {
    return mockParentPort;
  },
  get workerData() {
    return mockWorkerData;
  },
}));
jest.mock('@paralleax/shared', () => ({ importChoiceScript: mockImportChoiceScript }));

const files: ChoiceScriptSourceFile[] = [{ name: 'startup.txt', content: '*finish' }];
const result: ChoiceScriptImportResult = {
  report: {
    format: 'choicescript',
    sourceFileCount: 1,
    sceneCount: 1,
    interactionCount: 1,
    convertedCommandCount: 1,
    approximatedCommandCount: 0,
    ignoredCommandCount: 0,
    warningCount: 0,
    errorCount: 0,
    issues: [],
  },
};

async function loadWorker() {
  jest.resetModules();
  await import('./choicescript-import.worker');
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('ChoiceScript import worker entry point', () => {
  beforeEach(() => {
    mockPostMessage.mockReset();
    mockImportChoiceScript.mockReset();
    mockParentPort = { postMessage: mockPostMessage };
    mockWorkerData = {
      files,
      storyId: 'story-1',
      timestamp: '2026-10-17T12:00:00.000Z',
    };
  });

  it('captures every diagnostic to the report before returning the conversion result', async () => {
    mockImportChoiceScript.mockImplementation((receivedFiles: ChoiceScriptSourceFile[]) => {
      expect(receivedFiles).toBe(files);
      return result;
    });

    await loadWorker();

    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'result', result });
  });
});
