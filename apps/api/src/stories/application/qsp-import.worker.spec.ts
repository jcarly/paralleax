import type { QspImportOptions, QspImportResult, QspImportSource } from '@paralleax/shared';

const mockPostMessage = jest.fn();
const mockImportQsp = jest.fn();
let mockWorkerData: {
  source: QspImportSource;
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
jest.mock('@paralleax/shared', () => ({ importQsp: mockImportQsp }));

const source: QspImportSource = {
  name: 'start.qsps',
  format: 'text',
  content: "# Start\n'Hello'\n--- Start ---",
};
const result: QspImportResult = {
  report: {
    format: 'qsp',
    sourceFileCount: 1,
    locationCount: 1,
    actionCount: 0,
    interactionCount: 1,
    convertedStatementCount: 1,
    approximatedStatementCount: 0,
    unsupportedStatementCount: 0,
    warningCount: 0,
    errorCount: 0,
    coverage: [],
    issues: [],
  },
};

async function loadWorker() {
  jest.resetModules();
  await import('./qsp-import.worker');
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('QSP import worker entry point', () => {
  beforeEach(() => {
    mockPostMessage.mockReset();
    mockImportQsp.mockReset();
    mockParentPort = { postMessage: mockPostMessage };
    mockWorkerData = {
      source,
      storyId: 'story-1',
      timestamp: '2026-10-14T10:00:00.000Z',
    };
  });

  it('streams diagnostics and progress before returning the QSP conversion result', async () => {
    mockImportQsp.mockImplementation(
      (receivedSource: QspImportSource, options: QspImportOptions) => {
        expect(receivedSource).toBe(source);
        options.onProgress?.({ phase: 'parsing', completed: 1, total: 1 });
        return result;
      },
    );

    await loadWorker();

    expect(mockPostMessage).toHaveBeenNthCalledWith(1, {
      type: 'progress',
      progress: { phase: 'parsing', completed: 1, total: 1 },
    });
    expect(mockPostMessage).toHaveBeenNthCalledWith(2, { type: 'result', result });
  });

  it('reports an importer failure after closing the report writer', async () => {
    mockImportQsp.mockImplementation(() => {
      throw new Error('QSP parser failed');
    });

    await loadWorker();

    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'error', message: 'QSP parser failed' });
  });

  it('fails immediately when it is not running in a worker thread', async () => {
    mockParentPort = null;

    await expect(loadWorker()).rejects.toThrow('QSP worker must run in a worker thread.');
  });
});
