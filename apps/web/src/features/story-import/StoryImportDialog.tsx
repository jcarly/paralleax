import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { serializeQspLocationBundle } from '@paralleax/shared';
import type {
  ChoiceScriptImportReport,
  QspImportReport,
  QspSourceFormat,
  Story,
} from '@paralleax/shared';
import { api } from '../../api';
import { handleModalDialogKeyDown } from '../../components/modalDialogKeyboard';
import { loadStoryEditor } from '../../pages/storyRouteLoaders';

type StoryImportFormat = 'choicescript' | 'qsp';
type StoryImportReport = ChoiceScriptImportReport | QspImportReport;
type StoryImportProgress = { phase: 'uploading'; percentage: number } | { phase: 'processing' };

export function StoryImportDialog({
  isAdministrator,
  onClose,
  onImported,
}: {
  isAdministrator: boolean;
  onClose: () => void;
  onImported: (story: Story) => void;
}) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<StoryImportFormat>('choicescript');
  const [files, setFiles] = useState<File[]>([]);
  const [requestError, setRequestError] = useState('');
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<StoryImportProgress>();
  const [outcome, setOutcome] = useState<{ story: Story; report: StoryImportReport }>();
  const sourceSize = files.reduce((total, file) => total + file.size, 0);
  const selectionError = importSelectionError(format, files, sourceSize, isAdministrator, t);

  async function runImport(event: FormEvent) {
    event.preventDefault();
    if (pending || files.length === 0 || selectionError) return;
    try {
      setRequestError('');
      setPending(true);
      setProgress(
        format === 'qsp' && isAdministrator
          ? { phase: 'uploading', percentage: 0 }
          : { phase: 'processing' },
      );
      const result =
        format === 'qsp'
          ? await importQspFiles(files, isAdministrator, (percentage) => {
              setProgress(
                percentage >= 100 ? { phase: 'processing' } : { phase: 'uploading', percentage },
              );
            })
          : await api.importChoiceScript(
              await Promise.all(
                files.map(async (file) => ({ name: file.name, content: await file.text() })),
              ),
            );
      setOutcome(result);
      onImported(result.story);
    } catch (caught) {
      setRequestError(
        caught instanceof Error
          ? caught.message
          : t(format === 'qsp' ? 'library.import.qsp.failed' : 'library.import.failed'),
      );
    } finally {
      setPending(false);
      setProgress(undefined);
    }
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
            outcome
              ? format === 'qsp'
                ? 'library.import.qsp.resultTitle'
                : 'library.import.resultTitle'
              : format === 'qsp'
                ? 'library.import.qsp.title'
                : 'library.import.title',
          )}
        </h2>
        {outcome ? (
          <StoryImportResult report={outcome.report} />
        ) : (
          <>
            <label className="product-field">
              <span>{t('library.import.formatLabel')}</span>
              <select
                value={format}
                onChange={(event) => {
                  setFormat(event.currentTarget.value as StoryImportFormat);
                  setFiles([]);
                  setRequestError('');
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
                    setRequestError('');
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
                <p className="library-error choicescript-import-error" role="alert">
                  {selectionError || requestError}
                </p>
              ) : null}
              <p className="choicescript-import-notice">
                {t(format === 'qsp' ? 'library.import.qsp.notice' : 'library.import.notice')}
              </p>
              {pending && progress ? <ImportProgress progress={progress} /> : null}
              <div className="dialog-actions">
                <button
                  className="product-secondary"
                  type="button"
                  disabled={pending}
                  onClick={onClose}
                >
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
          <div className="dialog-actions">
            <button className="product-secondary" type="button" onClick={onClose}>
              {t('library.import.close')}
            </button>
            <Link
              className="product-primary"
              to={`/stories/${outcome.story.id}/edit`}
              onMouseEnter={() => void loadStoryEditor()}
              onFocus={() => void loadStoryEditor()}
            >
              {t('library.import.open')}
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ImportProgress({ progress }: { progress: StoryImportProgress }) {
  const { t } = useTranslation();
  const uploading = progress.phase === 'uploading';
  const label = uploading
    ? t('library.import.progress.uploading', { percentage: progress.percentage })
    : t('library.import.progress.processing');
  return (
    <div className="story-import-progress" aria-live="polite">
      <span>{label}</span>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={uploading ? progress.percentage : undefined}
        className={`story-import-progress-track${uploading ? '' : ' is-indeterminate'}`}
        role="progressbar"
      >
        <span style={uploading ? { width: `${progress.percentage}%` } : undefined} />
      </div>
    </div>
  );
}

function StoryImportResult({ report }: { report: StoryImportReport }) {
  const { t } = useTranslation();
  const warnings = report.issues.filter(({ severity }) => severity === 'warning');
  const warningCount =
    warnings.length + (report.format === 'qsp' ? (report.omittedWarningCount ?? 0) : 0);
  const sourceCount = report.format === 'qsp' ? report.locationCount : report.sceneCount;
  return (
    <div className="choicescript-import-result">
      <p>{t('library.import.resultDescription')}</p>
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
          <dd>{warningCount}</dd>
        </div>
      </dl>
      {warnings.length > 0 ? (
        <div className="choicescript-import-warnings">
          <b>{t('library.import.reviewWarnings')}</b>
          <ul>
            {warnings.slice(0, 8).map((issue, index) => (
              <li key={`${issue.fileName ?? ''}:${issue.line ?? ''}:${issue.code}:${index}`}>
                <span>
                  {[
                    issue.fileName,
                    'locationName' in issue ? issue.locationName : '',
                    issue.line ? t('library.import.line', { line: issue.line }) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {issue.message}
              </li>
            ))}
          </ul>
          {warningCount > 8 ? (
            <small>{t('library.import.moreWarnings', { count: warningCount - 8 })}</small>
          ) : null}
        </div>
      ) : (
        <p className="choicescript-import-clean">{t('library.import.noWarnings')}</p>
      )}
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

async function importQspFiles(
  files: File[],
  isAdministrator: boolean,
  onUploadProgress: (percentage: number) => void,
) {
  const source = await prepareQspSource(files);
  return isAdministrator
    ? api.importUnlimitedQsp(source, onUploadProgress)
    : api.importQsp({
        name: source.name,
        format: source.format,
        contentBase64: await readBlobAsBase64(source.content),
      });
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
