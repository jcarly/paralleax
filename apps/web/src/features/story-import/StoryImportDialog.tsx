import {
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { serializeQspLocationBundle } from '@paralleax/shared';
import type {
  ChoiceScriptImportReport,
  QspImportProgress,
  QspImportReport,
  QspSourceFormat,
  StorySummary,
} from '@paralleax/shared';
import { api, type StoryImportResponse } from '../../api';
import { apiErrorMessage, isApiErrorLike } from '../../apiErrorMessages';
import { handleModalDialogKeyDown } from '../../components/modalDialogKeyboard';
import { ModalPortal } from '../../components/ModalPortal';
import { NativeStoryImportForm } from './NativeStoryImportForm';
import { loadStoryEditor } from '../../pages/storyRouteLoaders';

type StoryImportFormat = 'choicescript' | 'qsp' | 'native';
type StoryImportReport = ChoiceScriptImportReport | QspImportReport;
type StoryImportOutcome = StoryImportResponse<StoryImportReport>;
type StoryImportProgress =
  | { phase: 'uploading'; percentage: number }
  | { phase: 'processing' }
  | { phase: 'qsp-analysis'; progress: QspImportProgress };
type StoryImportRequestError = {
  summary: string;
  report?: StoryImportReport;
  importId?: string;
  reportAvailable?: boolean;
};
type QspImportProgressSession = { progressId?: string; close: () => void };

interface StoryImportDialogProps {
  isAdministrator: boolean;
  onClose: () => void;
  onImported: (story: StorySummary) => void;
}

interface StoryImportController {
  isAdministrator: boolean;
  onClose: () => void;
  format: StoryImportFormat;
  setFormat: Dispatch<SetStateAction<StoryImportFormat>>;
  files: File[];
  setFiles: Dispatch<SetStateAction<File[]>>;
  sourceSize: number;
  selectionError: string;
  requestError?: StoryImportRequestError;
  setRequestError: Dispatch<SetStateAction<StoryImportRequestError | undefined>>;
  pending: boolean;
  setPending: Dispatch<SetStateAction<boolean>>;
  progress?: StoryImportProgress;
  outcome?: StoryImportOutcome;
  runImport: (event: FormEvent) => Promise<void>;
  requestImport: (confirmWarnings: boolean) => Promise<void>;
  cancelImport: () => void;
}

export function StoryImportDialog(props: StoryImportDialogProps) {
  const controller = useStoryImportController(props);
  return <StoryImportDialogView controller={controller} />;
}

function useStoryImportController({
  isAdministrator,
  onClose,
  onImported,
}: StoryImportDialogProps): StoryImportController {
  const { t } = useTranslation();
  const [format, setFormat] = useState<StoryImportFormat>('choicescript');
  const [files, setFiles] = useState<File[]>([]);
  const [requestError, setRequestError] = useState<StoryImportRequestError>();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<StoryImportProgress>();
  const [outcome, setOutcome] = useState<StoryImportOutcome>();
  const importAbort = useRef<AbortController | undefined>(undefined);
  const sourceSize = files.reduce((total, file) => total + file.size, 0);
  const selectionError = importSelectionError(format, files, sourceSize, isAdministrator, t);

  async function requestImport(confirmWarnings: boolean) {
    await submitStoryImport({
      format,
      files,
      isAdministrator,
      confirmWarnings,
      setProgress,
      setRequestError,
      setPending,
      setOutcome,
      importAbort,
      onImported,
      t,
    });
  }

  async function runImport(event: FormEvent) {
    event.preventDefault();
    if (pending || files.length === 0 || selectionError) {
      return;
    }
    await requestImport(false);
  }

  function cancelImport() {
    importAbort.current?.abort();
    onClose();
  }

  return {
    isAdministrator,
    onClose,
    format,
    setFormat,
    files,
    setFiles,
    sourceSize,
    selectionError,
    requestError,
    setRequestError,
    pending,
    setPending,
    progress,
    outcome,
    runImport,
    requestImport,
    cancelImport,
  };
}

interface StoryImportRequestOptions {
  format: StoryImportFormat;
  files: File[];
  isAdministrator: boolean;
  confirmWarnings: boolean;
  setProgress: Dispatch<SetStateAction<StoryImportProgress | undefined>>;
  setRequestError: Dispatch<SetStateAction<StoryImportRequestError | undefined>>;
  setPending: Dispatch<SetStateAction<boolean>>;
  setOutcome: Dispatch<SetStateAction<StoryImportOutcome | undefined>>;
  importAbort: MutableRefObject<AbortController | undefined>;
  onImported: (story: StorySummary) => void;
  t: ReturnType<typeof useTranslation>['t'];
}

async function submitStoryImport(options: StoryImportRequestOptions) {
  const controller = new AbortController();
  let progressSession: QspImportProgressSession | undefined;
  options.setRequestError(undefined);
  options.setPending(true);
  options.importAbort.current = controller;
  options.setProgress(
    options.format === 'qsp' && options.isAdministrator
      ? { phase: 'uploading', percentage: 0 }
      : { phase: 'processing' },
  );
  try {
    const request = await performStoryImport(options, controller.signal);
    progressSession = request.progressSession;
    options.setOutcome(request.outcome);
    if (request.outcome.status === 'imported') {
      options.onImported(request.outcome.story);
    }
  } catch (caught) {
    if (!isImportRequestCancelled(caught)) {
      options.setRequestError(createStoryImportError(caught, options.format, options.t));
    }
  } finally {
    progressSession?.close();
    if (options.importAbort.current === controller) {
      options.importAbort.current = undefined;
    }
    options.setPending(false);
    options.setProgress(undefined);
  }
}

async function performStoryImport(options: StoryImportRequestOptions, signal: AbortSignal) {
  if (options.format !== 'qsp') {
    const sources = await Promise.all(
      options.files.map(async (file) => ({ name: file.name, content: await file.text() })),
    );
    return {
      outcome: await api.importChoiceScript(sources, options.confirmWarnings, signal),
    };
  }
  const progressSession = await openQspImportProgress((progress) => {
    options.setProgress({ phase: 'qsp-analysis', progress });
  }, signal);
  try {
    const outcome = await importQspFiles(
      options.files,
      options.isAdministrator,
      (percentage) => {
        setUploadProgress(options.setProgress, percentage);
      },
      options.confirmWarnings,
      progressSession.progressId,
      signal,
    );
    return { outcome, progressSession };
  } catch (caught) {
    progressSession.close();
    throw caught;
  }
}

function setUploadProgress(
  setProgress: Dispatch<SetStateAction<StoryImportProgress | undefined>>,
  percentage: number,
) {
  setProgress(percentage >= 100 ? { phase: 'processing' } : { phase: 'uploading', percentage });
}

function createStoryImportError(
  caught: unknown,
  format: StoryImportFormat,
  t: ReturnType<typeof useTranslation>['t'],
): StoryImportRequestError {
  return {
    summary: apiErrorMessage(
      caught,
      t,
      t(format === 'qsp' ? 'library.import.qsp.failed' : 'library.import.failed'),
    ),
    report: storyImportFailureReport(caught),
    importId: storyImportFailureId(caught),
    reportAvailable: storyImportReportAvailable(caught),
  };
}

type StoryImportTitleKey =
  | 'library.import.native.title'
  | 'library.import.reviewTitle'
  | 'library.import.qsp.resultTitle'
  | 'library.import.resultTitle'
  | 'library.import.qsp.title'
  | 'library.import.title';

function storyImportTitleKey(
  format: StoryImportFormat,
  outcome: StoryImportOutcome | undefined,
): StoryImportTitleKey {
  if (format === 'native') {
    return 'library.import.native.title';
  }
  if (outcome?.status === 'confirmation_required') {
    return 'library.import.reviewTitle';
  }
  if (outcome) {
    return format === 'qsp' ? 'library.import.qsp.resultTitle' : 'library.import.resultTitle';
  }
  return format === 'qsp' ? 'library.import.qsp.title' : 'library.import.title';
}

function StoryImportDialogView({ controller }: { controller: StoryImportController }) {
  const title = storyImportTitleKey(controller.format, controller.outcome);
  return (
    <ModalPortal>
      <div className="modal-backdrop product-page" role="presentation">
        <section
          className="new-story-dialog choicescript-import-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="story-import-title"
          onKeyDown={(event) => {
            handleModalDialogKeyDown(event, () => {
              if (!controller.pending) {
                controller.onClose();
              }
            });
          }}
        >
          <ImportDialogHeader title={title} native={controller.format === 'native'} />
          {controller.format === 'native' ? (
            <>
              <ImportFormatSelect controller={controller} />
              <NativeStoryImportForm
                onClose={controller.onClose}
                onPendingChange={controller.setPending}
              />
            </>
          ) : controller.outcome ? (
            <StoryImportReportView
              key={controller.outcome.status}
              mode={controller.outcome.status === 'imported' ? 'imported' : 'review'}
              report={controller.outcome.report}
              importId={controller.outcome.importId}
            />
          ) : (
            <StoryImportForm controller={controller} />
          )}
          {controller.outcome ? <ImportOutcomeActions controller={controller} /> : null}
        </section>
      </div>
    </ModalPortal>
  );
}

function ImportDialogHeader({ title, native }: { title: StoryImportTitleKey; native: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="dialog-icon" aria-hidden="true">
        â‡§
      </div>
      <span className="product-eyebrow">
        {t(native ? 'library.import.native.eyebrow' : 'library.import.eyebrow')}
      </span>
      <h2 id="story-import-title">{t(title)}</h2>
    </>
  );
}

function StoryImportForm({ controller }: { controller: StoryImportController }) {
  const { t } = useTranslation();
  return (
    <>
      <p>
        {t(
          controller.format === 'qsp'
            ? 'library.import.qsp.description'
            : 'library.import.description',
        )}
      </p>
      <form
        onSubmit={(event) => {
          void controller.runImport(event);
        }}
      >
        <ImportFormatSelect controller={controller} />
        <ImportFileSelect controller={controller} />
        {controller.files.length > 0 ? <ImportFileSummary controller={controller} /> : null}
        {controller.selectionError || controller.requestError ? (
          <ImportRequestError
            selectionError={controller.selectionError}
            error={controller.requestError}
          />
        ) : null}
        <p className="choicescript-import-notice">
          {t(controller.format === 'qsp' ? 'library.import.qsp.notice' : 'library.import.notice')}
        </p>
        {controller.pending && controller.progress ? (
          <ImportProgress progress={controller.progress} />
        ) : null}
        <ImportFormActions controller={controller} />
      </form>
    </>
  );
}

function ImportFormatSelect({ controller }: { controller: StoryImportController }) {
  const { t } = useTranslation();
  return (
    <label className="form-field form-field--standard">
      <span>{t('library.import.formatLabel')}</span>
      <select
        className="form-control form-control--standard"
        value={controller.format}
        disabled={controller.pending}
        onChange={(event) => {
          controller.setFormat(event.currentTarget.value as StoryImportFormat);
          controller.setFiles([]);
          controller.setRequestError(undefined);
        }}
      >
        <option value="choicescript">{t('library.import.formats.choicescript')}</option>
        <option value="qsp">{t('library.import.formats.qsp')}</option>
        <option value="native">{t('library.import.formats.native')}</option>
      </select>
    </label>
  );
}

function ImportFileSelect({ controller }: { controller: StoryImportController }) {
  const { t } = useTranslation();
  const isQsp = controller.format === 'qsp';
  return (
    <label className="form-field form-field--standard choicescript-file-field">
      <span>{t(isQsp ? 'library.import.qsp.filesLabel' : 'library.import.filesLabel')}</span>
      <input
        key={controller.format}
        autoFocus
        data-modal-autofocus
        multiple
        accept={isQsp ? '.qsp,.gam,.qsps,.qsp-txt,.txt-qsp,.qsrc' : '.txt,text/plain'}
        type="file"
        onChange={(event) => {
          controller.setFiles(Array.from(event.currentTarget.files ?? []));
          controller.setRequestError(undefined);
        }}
      />
    </label>
  );
}

function ImportFileSummary({ controller }: { controller: StoryImportController }) {
  const { t } = useTranslation();
  const sizeLabel =
    controller.format === 'qsp'
      ? controller.isAdministrator
        ? 'library.import.qsp.sizeAdministrator'
        : 'library.import.qsp.size'
      : 'library.import.size';
  return (
    <div className="choicescript-file-summary" aria-live="polite">
      <b>{t('library.import.selected', { count: controller.files.length })}</b>
      <span>{summarizeFileNames(controller.files, t)}</span>
      <small>{t(sizeLabel, { size: Math.ceil(controller.sourceSize / 1024) })}</small>
    </div>
  );
}

function ImportFormActions({ controller }: { controller: StoryImportController }) {
  const { t } = useTranslation();
  return (
    <div className="dialog-actions">
      <button className="product-secondary" type="button" onClick={controller.cancelImport}>
        {t('library.import.cancel')}
      </button>
      <button
        className="product-primary"
        type="submit"
        disabled={
          controller.files.length === 0 || Boolean(controller.selectionError) || controller.pending
        }
      >
        {t(controller.pending ? 'library.import.importing' : 'library.import.submit')}
      </button>
    </div>
  );
}

function ImportOutcomeActions({ controller }: { controller: StoryImportController }) {
  const { t } = useTranslation();
  const outcome = controller.outcome;
  if (!outcome) {
    return null;
  }
  return (
    <>
      {controller.requestError ? <ImportRequestError error={controller.requestError} /> : null}
      {controller.pending && controller.progress ? (
        <ImportProgress progress={controller.progress} />
      ) : null}
      <div className="dialog-actions">
        <button className="product-secondary" type="button" onClick={controller.cancelImport}>
          {t('library.import.close')}
        </button>
        {outcome.status === 'confirmation_required' ? (
          <button
            className="product-primary"
            type="button"
            disabled={controller.pending}
            onClick={() => {
              void controller.requestImport(true);
            }}
          >
            {t(controller.pending ? 'library.import.importing' : 'library.import.confirm')}
          </button>
        ) : (
          <Link
            className="product-primary"
            to={`/stories/${outcome.story.id}/edit`}
            onMouseEnter={() => void loadStoryEditor()}
            onFocus={() => void loadStoryEditor()}
          >
            {t('library.import.open')}
          </Link>
        )}
      </div>
    </>
  );
}

function ImportRequestError({
  selectionError,
  error,
}: {
  selectionError?: string;
  error?: StoryImportRequestError;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="library-error choicescript-import-error" role="alert">
        <p>{selectionError || error?.summary}</p>
      </div>
      {error?.report ? (
        <StoryImportReportView mode="failure" report={error.report} importId={error.importId} />
      ) : error?.reportAvailable && error.importId ? (
        <div className="story-import-report-heading">
          <a className="product-secondary" href={api.importReportUrl(error.importId)}>
            {t('library.import.downloadReport')}
          </a>
        </div>
      ) : null}
    </>
  );
}

function ImportProgress({ progress }: { progress: StoryImportProgress }) {
  const { t } = useTranslation();
  const uploading = progress.phase === 'uploading';
  const analysis = progress.phase === 'qsp-analysis' ? progress.progress : undefined;
  const total = analysis?.total;
  const determinate = uploading || (total !== undefined && total > 0);
  const value = uploading ? progress.percentage : analysis?.completed;
  const maximum = uploading ? 100 : total;
  const ariaMaximum = maximum ?? 100;
  const percentage =
    determinate && value !== undefined && maximum !== undefined
      ? Math.min(100, (value / maximum) * 100)
      : undefined;
  const label = uploading
    ? t('library.import.progress.uploading', { percentage: progress.percentage })
    : analysis
      ? analysis.total === undefined
        ? t(`library.import.progress.phases.${analysis.phase}`)
        : t('library.import.progress.analyzing', {
            phase: t(`library.import.progress.phases.${analysis.phase}`),
            completed: analysis.completed,
            total: analysis.total,
          })
      : t('library.import.progress.processing');
  return (
    <div className="story-import-progress" aria-live="polite">
      <span>{label}</span>
      {analysis?.currentFile ? (
        <small>{t('library.import.progress.currentFile', { file: analysis.currentFile })}</small>
      ) : null}
      <div
        aria-label={label}
        aria-valuemax={determinate ? ariaMaximum : 100}
        aria-valuemin={0}
        aria-valuenow={determinate ? value : undefined}
        className={`story-import-progress-track${determinate ? '' : ' is-indeterminate'}`}
        role="progressbar"
      >
        <span style={percentage === undefined ? undefined : { width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function StoryImportReportView({
  report,
  mode,
  importId,
}: {
  report: StoryImportReport;
  mode: 'failure' | 'review' | 'imported';
  importId?: string;
}) {
  const { t } = useTranslation();
  const sourceCount = report.format === 'qsp' ? report.locationCount : report.sceneCount;
  return (
    <div className="choicescript-import-result">
      <div className="story-import-report-heading">
        <p>{t(`library.import.${mode}Description`)}</p>
        {importId ? (
          <a className="product-secondary" href={api.importReportUrl(importId)}>
            {t('library.import.downloadReport')}
          </a>
        ) : null}
      </div>
      <dl>
        <div>
          <dt>
            {t(report.format === 'qsp' ? 'library.import.qsp.locations' : 'library.import.scenes')}
          </dt>
          <dd>{sourceCount}</dd>
        </div>
        <div>
          <dt>{t('library.import.interactions')}</dt>
          <dd>{report.interactionCount}</dd>
        </div>
        <div>
          <dt>{t('library.import.warnings')}</dt>
          <dd>{report.warningCount}</dd>
        </div>
        <div>
          <dt>{t('library.import.errors')}</dt>
          <dd>{report.errorCount}</dd>
        </div>
      </dl>
      {report.warningCount === 0 && report.errorCount === 0 ? (
        <p className="choicescript-import-clean">{t('library.import.noWarnings')}</p>
      ) : null}
      {report.format === 'qsp' ? <QspCoverage report={report} /> : null}
    </div>
  );
}

function QspCoverage({ report }: { report: QspImportReport }) {
  const { t } = useTranslation();
  return (
    <div className="qsp-import-coverage">
      <b>{t('library.import.qsp.coverage.title')}</b>
      <p>{t('library.import.qsp.coverage.description')}</p>
      <ul>
        {report.coverage.map(({ feature, support, occurrences }) => (
          <li key={feature}>
            <span>{t(`library.import.qsp.coverage.features.${feature}`)}</span>
            <small className={`support-${support}`}>
              {t(`library.import.qsp.coverage.support.${support}`)}
              {occurrences > 0
                ? ` · ${t('library.import.qsp.coverage.occurrences', { count: occurrences })}`
                : ''}
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function importSelectionError(
  format: StoryImportFormat,
  files: File[],
  sourceSize: number,
  isAdministrator: boolean,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (format === 'qsp') {
    const locationFiles = files.filter(({ name }) => /\.qsrc$/i.test(name));
    if (files.length > 1 && locationFiles.length !== files.length) {
      return t('library.import.qsp.incompatibleFiles');
    }
    if (files.some(({ name }) => !/\.(?:qsp|gam|qsps|qsp-txt|txt-qsp|qsrc)$/i.test(name))) {
      return t('library.import.qsp.invalidFile');
    }
    if (!isAdministrator && sourceSize > 80 * 1024) {
      return t('library.import.qsp.tooLarge');
    }
    return '';
  }
  if (files.length > 50) {
    return t('library.import.tooManyFiles');
  }
  if (files.some(({ size }) => size > 65_536)) {
    return t('library.import.fileTooLarge');
  }
  if (sourceSize > 96 * 1024) {
    return t('library.import.tooLarge');
  }
  return '';
}

function qspFormatForFileName(name: string): QspSourceFormat {
  if (/\.(?:qsp|gam)$/i.test(name)) {
    return 'binary';
  }
  return /\.qsrc$/i.test(name) ? 'locations' : 'text';
}

async function openQspImportProgress(
  onProgress: (progress: QspImportProgress) => void,
  signal?: AbortSignal,
): Promise<QspImportProgressSession> {
  if (typeof EventSource === 'undefined') {
    return { close: () => undefined };
  }
  if (signal?.aborted) {
    throw new DOMException('The QSP import was cancelled.', 'AbortError');
  }

  const progressId = crypto.randomUUID();
  const stream = new EventSource(`/api/stories/imports/qsp/progress/${progressId}`);

  return new Promise((resolve, reject) => {
    let ready = false;
    let close: () => void = () => {};
    const abort = () => {
      close();
      reject(new DOMException('The QSP import was cancelled.', 'AbortError'));
    };
    const receiveReady = () => {
      if (ready) {
        return;
      }

      ready = true;
      signal?.removeEventListener('abort', abort);
      stream.removeEventListener('ready', receiveReady);
      stream.removeEventListener('error', rejectUnavailableStream);
      resolve({ progressId, close });
    };
    const receiveProgress = (event: Event) => {
      reportQspProgress(event, onProgress);
    };
    const rejectUnavailableStream = () => {
      if (ready) {
        return;
      }

      close();
      resolve({ close: () => undefined });
    };
    close = createQspProgressCloser({
      stream,
      signal,
      abort,
      receiveReady,
      receiveProgress,
      rejectUnavailableStream,
    });

    registerQspProgressListeners({
      stream,
      signal,
      abort,
      receiveReady,
      receiveProgress,
      rejectUnavailableStream,
    });
  });
}

function registerQspProgressListeners({
  stream,
  signal,
  abort,
  receiveReady,
  receiveProgress,
  rejectUnavailableStream,
}: {
  stream: EventSource;
  signal?: AbortSignal;
  abort: () => void;
  receiveReady: EventListener;
  receiveProgress: EventListener;
  rejectUnavailableStream: EventListener;
}) {
  if (signal?.aborted) {
    abort();
    return;
  }
  stream.addEventListener('ready', receiveReady);
  stream.addEventListener('progress', receiveProgress);
  stream.addEventListener('error', rejectUnavailableStream);
  signal?.addEventListener('abort', abort, { once: true });
}

function reportQspProgress(event: Event, onProgress: (progress: QspImportProgress) => void) {
  try {
    onProgress(JSON.parse((event as MessageEvent<string>).data) as QspImportProgress);
  } catch {
    // Ignore malformed transient progress events; the import response remains authoritative.
  }
}

function createQspProgressCloser({
  stream,
  signal,
  abort,
  receiveReady,
  receiveProgress,
  rejectUnavailableStream,
}: {
  stream: EventSource;
  signal?: AbortSignal;
  abort: () => void;
  receiveReady: EventListener;
  receiveProgress: EventListener;
  rejectUnavailableStream: EventListener;
}) {
  return () => {
    signal?.removeEventListener('abort', abort);
    stream.removeEventListener('ready', receiveReady);
    stream.removeEventListener('progress', receiveProgress);
    stream.removeEventListener('error', rejectUnavailableStream);
    stream.close();
  };
}

async function importQspFiles(
  files: File[],
  isAdministrator: boolean,
  onUploadProgress: (percentage: number) => void,
  confirmWarnings: boolean,
  progressId?: string,
  signal?: AbortSignal,
) {
  const source = await prepareQspSource(files);
  return isAdministrator
    ? api.importUnlimitedQsp(source, onUploadProgress, confirmWarnings, progressId, signal)
    : api.importQsp(
        {
          name: source.name,
          format: source.format,
          contentBase64: await readBlobAsBase64(source.content),
        },
        confirmWarnings,
        progressId,
        signal,
      );
}

async function prepareQspSource(files: File[]): Promise<{
  name: string;
  format: QspSourceFormat;
  content: Blob;
}> {
  const format = qspFormatForFileName(files[0].name);
  if (format !== 'locations') {
    return { name: files[0].name, format, content: files[0] };
  }
  const sources = await Promise.all(
    files.map(async (file) => ({
      name: file.webkitRelativePath || file.name,
      content: await file.text(),
    })),
  );
  return {
    name: qspLocationsSourceName(files),
    format,
    content: new Blob([serializeQspLocationBundle(sources)], {
      type: 'application/octet-stream',
    }),
  };
}

function qspLocationsSourceName(files: File[]) {
  const relativeRoot = files
    .map(({ webkitRelativePath }) => (webkitRelativePath ?? '').split('/').filter(Boolean)[0])
    .find(Boolean);
  return `${relativeRoot || 'QSP locations'}.qsrc`;
}

function summarizeFileNames(files: File[], t: ReturnType<typeof useTranslation>['t']) {
  const visible = files.slice(0, 4).map(({ name }) => name);
  return files.length > visible.length
    ? `${visible.join(', ')} · ${t('library.import.moreFiles', { count: files.length - visible.length })}`
    : visible.join(', ');
}

async function readBlobAsBase64(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function storyImportFailureReport(caught: unknown): StoryImportReport | undefined {
  if (!isStoryImportFailure(caught)) {
    return undefined;
  }
  if (!isRecord(caught.details) || !isRecord(caught.details.report)) {
    return undefined;
  }
  const report = caught.details.report;
  if (
    (report.format !== 'choicescript' && report.format !== 'qsp') ||
    typeof report.warningCount !== 'number' ||
    typeof report.errorCount !== 'number'
  ) {
    return undefined;
  }
  return report as unknown as StoryImportReport;
}

function storyImportReportAvailable(caught: unknown) {
  if (!isStoryImportFailure(caught) || !isRecord(caught.details)) {
    return false;
  }
  return caught.details.reportAvailable === true || storyImportFailureReport(caught) !== undefined;
}

function storyImportFailureId(caught: unknown) {
  if (!isStoryImportFailure(caught) || !storyImportReportAvailable(caught)) {
    return undefined;
  }
  if (!isRecord(caught.details) || typeof caught.details.importId !== 'string') {
    return undefined;
  }
  return caught.details.importId;
}

function isStoryImportFailure(
  caught: unknown,
): caught is Error & { status: number; code: string; details?: unknown } {
  return (
    isApiErrorLike(caught) &&
    (caught.code === 'STORY_IMPORT_FAILED' || caught.code === 'STORY_IMPORT_SAVE_FAILED')
  );
}

function isImportRequestCancelled(caught: unknown) {
  return (
    (caught instanceof DOMException && caught.name === 'AbortError') ||
    (isApiErrorLike(caught) && caught.code === 'REQUEST_CANCELLED')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
