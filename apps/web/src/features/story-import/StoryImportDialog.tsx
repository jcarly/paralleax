import { useRef, useState, type FormEvent } from 'react';
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
import { loadStoryEditor } from '../../pages/storyRouteLoaders';

type StoryImportFormat = 'choicescript' | 'qsp';
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

export function StoryImportDialog({
  isAdministrator,
  onClose,
  onImported,
}: {
  isAdministrator: boolean;
  onClose: () => void;
  onImported: (story: StorySummary) => void;
}) {
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

  async function runImport(event: FormEvent) {
    event.preventDefault();
    if (pending || files.length === 0 || selectionError) return;
    await requestImport(false);
  }

  async function requestImport(confirmWarnings: boolean) {
    const controller = new AbortController();
    let progressSession: QspImportProgressSession | undefined;
    try {
      setRequestError(undefined);
      setPending(true);
      importAbort.current = controller;
      setProgress(
        format === 'qsp' && isAdministrator
          ? { phase: 'uploading', percentage: 0 }
          : { phase: 'processing' },
      );
      let result: StoryImportOutcome;
      if (format === 'qsp') {
        progressSession = await openQspImportProgress(
          (qspProgress) => setProgress({ phase: 'qsp-analysis', progress: qspProgress }),
          controller?.signal,
        );
        result = await importQspFiles(
          files,
          isAdministrator,
          (percentage) => {
            setProgress(
              percentage >= 100 ? { phase: 'processing' } : { phase: 'uploading', percentage },
            );
          },
          confirmWarnings,
          progressSession.progressId,
          controller?.signal,
        );
      } else {
        result = await api.importChoiceScript(
          await Promise.all(
            files.map(async (file) => ({ name: file.name, content: await file.text() })),
          ),
          confirmWarnings,
          controller.signal,
        );
      }
      setOutcome(result);
      if (result.status === 'imported') onImported(result.story);
    } catch (caught) {
      if (isImportRequestCancelled(caught)) return;
      const report = storyImportFailureReport(caught);
      const reportAvailable = storyImportReportAvailable(caught);
      setRequestError({
        summary: apiErrorMessage(
          caught,
          t,
          t(format === 'qsp' ? 'library.import.qsp.failed' : 'library.import.failed'),
        ),
        report,
        importId: storyImportFailureId(caught),
        reportAvailable,
      });
    } finally {
      progressSession?.close();
      if (importAbort.current === controller) importAbort.current = undefined;
      setPending(false);
      setProgress(undefined);
    }
  }

  function cancelImport() {
    importAbort.current?.abort();
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="new-story-dialog choicescript-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-import-title"
        onKeyDown={(event) =>
          handleModalDialogKeyDown(event, () => {
            if (!pending) onClose();
          })
        }
      >
        <div className="dialog-icon" aria-hidden="true">
          ⇧
        </div>
        <span className="product-eyebrow">{t('library.import.eyebrow')}</span>
        <h2 id="story-import-title">
          {t(
            outcome?.status === 'confirmation_required'
              ? 'library.import.reviewTitle'
              : outcome
                ? format === 'qsp'
                  ? 'library.import.qsp.resultTitle'
                  : 'library.import.resultTitle'
                : format === 'qsp'
                  ? 'library.import.qsp.title'
                  : 'library.import.title',
          )}
        </h2>
        {outcome ? (
          <StoryImportReportView
            key={outcome.status}
            mode={outcome.status === 'imported' ? 'imported' : 'review'}
            report={outcome.report}
            importId={outcome.importId}
          />
        ) : (
          <>
            <label className="product-field">
              <span>{t('library.import.formatLabel')}</span>
              <select
                value={format}
                onChange={(event) => {
                  setFormat(event.currentTarget.value as StoryImportFormat);
                  setFiles([]);
                  setRequestError(undefined);
                }}
              >
                <option value="choicescript">{t('library.import.formats.choicescript')}</option>
                <option value="qsp">{t('library.import.formats.qsp')}</option>
              </select>
            </label>
            <p>
              {t(
                format === 'qsp' ? 'library.import.qsp.description' : 'library.import.description',
              )}
            </p>
            <form onSubmit={(event) => void runImport(event)}>
              <label className="product-field choicescript-file-field">
                <span>
                  {t(
                    format === 'qsp'
                      ? 'library.import.qsp.filesLabel'
                      : 'library.import.filesLabel',
                  )}
                </span>
                <input
                  key={format}
                  autoFocus
                  multiple
                  accept={
                    format === 'qsp' ? '.qsp,.gam,.qsps,.qsp-txt,.txt-qsp,.qsrc' : '.txt,text/plain'
                  }
                  type="file"
                  onChange={(event) => {
                    setFiles(Array.from(event.currentTarget.files ?? []));
                    setRequestError(undefined);
                  }}
                />
              </label>
              {files.length > 0 ? (
                <div className="choicescript-file-summary" aria-live="polite">
                  <b>{t('library.import.selected', { count: files.length })}</b>
                  <span>{summarizeFileNames(files, t)}</span>
                  <small>
                    {t(
                      format === 'qsp'
                        ? isAdministrator
                          ? 'library.import.qsp.sizeAdministrator'
                          : 'library.import.qsp.size'
                        : 'library.import.size',
                      { size: Math.ceil(sourceSize / 1024) },
                    )}
                  </small>
                </div>
              ) : null}
              {selectionError || requestError ? (
                <ImportRequestError selectionError={selectionError} error={requestError} />
              ) : null}
              <p className="choicescript-import-notice">
                {t(format === 'qsp' ? 'library.import.qsp.notice' : 'library.import.notice')}
              </p>
              {pending && progress ? <ImportProgress progress={progress} /> : null}
              <div className="dialog-actions">
                <button className="product-secondary" type="button" onClick={cancelImport}>
                  {t('library.import.cancel')}
                </button>
                <button
                  className="product-primary"
                  type="submit"
                  disabled={files.length === 0 || Boolean(selectionError) || pending}
                >
                  {t(pending ? 'library.import.importing' : 'library.import.submit')}
                </button>
              </div>
            </form>
          </>
        )}
        {outcome ? (
          <>
            {requestError ? <ImportRequestError error={requestError} /> : null}
            {pending && progress ? <ImportProgress progress={progress} /> : null}
            <div className="dialog-actions">
              <button className="product-secondary" type="button" onClick={cancelImport}>
                {t('library.import.close')}
              </button>
              {outcome.status === 'confirmation_required' ? (
                <button
                  className="product-primary"
                  type="button"
                  disabled={pending}
                  onClick={() => void requestImport(true)}
                >
                  {t(pending ? 'library.import.importing' : 'library.import.confirm')}
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
        ) : null}
      </section>
    </div>
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
    if (files.length > 1 && locationFiles.length !== files.length)
      return t('library.import.qsp.incompatibleFiles');
    if (files.some(({ name }) => !/\.(?:qsp|gam|qsps|qsp-txt|txt-qsp|qsrc)$/i.test(name)))
      return t('library.import.qsp.invalidFile');
    if (!isAdministrator && sourceSize > 80 * 1024) return t('library.import.qsp.tooLarge');
    return '';
  }
  if (files.length > 50) return t('library.import.tooManyFiles');
  if (files.some(({ size }) => size > 65_536)) return t('library.import.fileTooLarge');
  if (sourceSize > 96 * 1024) return t('library.import.tooLarge');
  return '';
}

function qspFormatForFileName(name: string): QspSourceFormat {
  if (/\.(?:qsp|gam)$/i.test(name)) return 'binary';
  return /\.qsrc$/i.test(name) ? 'locations' : 'text';
}

async function openQspImportProgress(
  onProgress: (progress: QspImportProgress) => void,
  signal?: AbortSignal,
): Promise<QspImportProgressSession> {
  if (typeof EventSource === 'undefined') return { close: () => undefined };
  if (signal?.aborted) throw new DOMException('The QSP import was cancelled.', 'AbortError');

  const progressId = crypto.randomUUID();
  const stream = new EventSource(`/api/stories/imports/qsp/progress/${progressId}`);

  return new Promise((resolve, reject) => {
    let ready = false;
    const close = () => {
      signal?.removeEventListener('abort', abort);
      stream.removeEventListener('ready', receiveReady);
      stream.removeEventListener('progress', receiveProgress);
      stream.removeEventListener('error', rejectUnavailableStream);
      stream.close();
    };
    const abort = () => {
      close();
      reject(new DOMException('The QSP import was cancelled.', 'AbortError'));
    };
    const receiveReady = () => {
      if (ready) return;

      ready = true;
      signal?.removeEventListener('abort', abort);
      stream.removeEventListener('ready', receiveReady);
      stream.removeEventListener('error', rejectUnavailableStream);
      resolve({ progressId, close });
    };
    const receiveProgress = (event: Event) => {
      try {
        onProgress(JSON.parse((event as MessageEvent<string>).data) as QspImportProgress);
      } catch {
        // Ignore malformed transient progress events; the import response remains authoritative.
      }
    };
    const rejectUnavailableStream = () => {
      if (ready) return;

      close();
      resolve({ close: () => undefined });
    };

    if (signal?.aborted) {
      abort();
      return;
    }
    stream.addEventListener('ready', receiveReady);
    stream.addEventListener('progress', receiveProgress);
    stream.addEventListener('error', rejectUnavailableStream);
    signal?.addEventListener('abort', abort, { once: true });
  });
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
  if (format !== 'locations') return { name: files[0].name, format, content: files[0] };
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
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function storyImportFailureReport(caught: unknown): StoryImportReport | undefined {
  if (!isStoryImportFailure(caught)) return undefined;
  if (!isRecord(caught.details) || !isRecord(caught.details.report)) return undefined;
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
  if (!isStoryImportFailure(caught) || !isRecord(caught.details)) return false;
  return caught.details.reportAvailable === true || storyImportFailureReport(caught) !== undefined;
}

function storyImportFailureId(caught: unknown) {
  if (!isStoryImportFailure(caught) || !storyImportReportAvailable(caught)) return undefined;
  if (!isRecord(caught.details) || typeof caught.details.importId !== 'string') return undefined;
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
