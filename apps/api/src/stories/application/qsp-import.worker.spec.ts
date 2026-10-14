import type { QspImportOptions, QspImportResult, QspImportSource } from '@paralleax/shared';

const mockPostMessage = jest.fn();
const mockStart = jest.fn();
const mockClose = jest.fn();
const mockWriteIssue = jest.fn();
const mockWriterConstructor = jest.fn();
const mockImportQsp = jest.fn();
let mockWorkerData: {
  source: QspImportSource;
  storyId: string;
  timestamp: string;
  reportPath: string;
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
jest.mock('../../imports/import-report-writer.js', () => ({
  ImportReportWriter: mockWriterConstructor,
}));

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
    mockStart.mockReset().mockResolvedValue(undefined);
    mockClose.mockReset().mockResolvedValue(undefined);
    mockWriteIssue.mockReset();
    mockWriterConstructor.mockReset().mockImplementation(() => ({
      start: mockStart,
      close: mockClose,
      writeIssue: mockWriteIssue,
    }));
    mockImportQsp.mockReset();
    mockParentPort = { postMessage: mockPostMessage };
    mockWorkerData = {
      source,
      storyId: 'story-1',
      timestamp: '2026-10-14T10:00:00.000Z',
      reportPath: 'C:\\tmp\\qsp-report.jsonl',
    };
  });

  it('streams diagnostics and progress before returning the QSP conversion result', async () => {
    mockImportQsp.mockImplementation(
      (receivedSource: QspImportSource, options: QspImportOptions) => {
        expect(receivedSource).toBe(source);
        options.onIssue?.({ severity: 'warning', code: 'unsupported', message: 'Unsupported.' });
        options.onProgress?.({ phase: 'parsing', completed: 1, total: 1 });
        return result;
      },
    );

    await loadWorker();

    expect(mockWriterConstructor).toHaveBeenCalledWith({ reportPath: mockWorkerData.reportPath });
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockWriteIssue).toHaveBeenCalledWith({
      severity: 'warning',
      code: 'unsupported',
      message: 'Unsupported.',
    });
    expect(mockClose).toHaveBeenCalledTimes(1);
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

    expect(mockClose).toHaveBeenCalledTimes(2);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'error', message: 'QSP parser failed' });
  });

  it('retains both failures when report finalization also fails', async () => {
    mockStart.mockRejectedValue(new Error('report could not start'));
    mockClose.mockRejectedValue(new Error('report could not close'));

    await loadWorker();

    expect(mockImportQsp).not.toHaveBeenCalled();
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'error',
      message: 'QSP import report finalization failed.',
    });
  });

  it('fails immediately when it is not running in a worker thread', async () => {
    mockParentPort = null;

    await expect(loadWorker()).rejects.toThrow('QSP worker must run in a worker thread.');
  });
});
