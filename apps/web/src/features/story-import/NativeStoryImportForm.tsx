import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import type { TFunction } from 'i18next';
import { NATIVE_STORY_FILE_LIMIT_BYTES, type NativeStoryImportSummary } from '@paralleax/shared';
import { api } from '../../api';
import { apiErrorMessage, isApiErrorLike } from '../../apiErrorMessages';

type Stage = 'idle' | 'checking' | 'importing';
type ImportError = { message: string; path?: string; outcomeUnknown?: boolean };
type NativeImportState = {
  file?: File;
  summary?: NativeStoryImportSummary;
  error?: ImportError;
  stage: Stage;
  setFile: Dispatch<SetStateAction<File | undefined>>;
  setSummary: Dispatch<SetStateAction<NativeStoryImportSummary | undefined>>;
  setError: Dispatch<SetStateAction<ImportError | undefined>>;
  setStage: Dispatch<SetStateAction<Stage>>;
  active: MutableRefObject<AbortController | undefined>;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
  onImportOutcomeUnknown: () => void;
  navigate: NavigateFunction;
  t: TFunction;
};

type NativeImportProps = {
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
  onImportOutcomeUnknown: () => void;
};

export function NativeStoryImportForm(props: NativeImportProps) {
  const state = useNativeStoryImport(props);
  return <NativeStoryImportView state={state} />;
}

function useNativeStoryImport({
  onClose,
  onPendingChange,
  onImportOutcomeUnknown,
}: NativeImportProps): NativeImportState {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [file, setFile] = useState<File>();
  const [summary, setSummary] = useState<NativeStoryImportSummary>();
  const [error, setError] = useState<ImportError>();
  const [stage, setStage] = useState<Stage>('idle');
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => active.current?.abort(), []);
  return {
    file,
    summary,
    error,
    stage,
    setFile,
    setSummary,
    setError,
    setStage,
    active,
    onClose,
    onPendingChange,
    onImportOutcomeUnknown,
    navigate,
    t,
  };
}

async function selectNativeFile(state: NativeImportState, selected: File | undefined) {
  state.active.current?.abort();
  state.setFile(selected);
  state.setSummary(undefined);
  state.setError(undefined);
  if (!selected) {
    return;
  }
  if (!/\.json$/i.test(selected.name)) {
    state.setError({ message: state.t('library.import.native.invalidFile') });
    return;
  }
  if (selected.size > NATIVE_STORY_FILE_LIMIT_BYTES) {
    state.setError({ message: state.t('library.import.native.tooLarge') });
    return;
  }
  const operation = beginNativeRequest(state, 'checking');
  try {
    const summary = await api.previewNativeStory(selected, operation.signal);
    if (state.active.current === operation && !operation.signal.aborted) {
      state.setSummary(summary);
    }
  } catch (caught) {
    if (!operation.signal.aborted) {
      state.setError(nativeImportError(caught, state.t));
    }
  } finally {
    finishNativeRequest(state, operation);
  }
}

async function createNativeStory(state: NativeImportState) {
  if (!state.file || !state.summary || state.stage !== 'idle') {
    return;
  }
  const operation = beginNativeRequest(state, 'importing');
  state.setError(undefined);
  try {
    const result = await api.importNativeStory(state.file, operation.signal);
    if (operation.signal.aborted || state.active.current !== operation) {
      return;
    }
    state.active.current = undefined;
    state.onPendingChange(false);
    void state.navigate(`/stories/${encodeURIComponent(result.id)}/edit`);
  } catch (caught) {
    if (!operation.signal.aborted) {
      const outcomeUnknown = importOutcomeMayBeUnknown(caught);
      state.setError({ ...nativeImportError(caught, state.t), outcomeUnknown });
      if (outcomeUnknown) {
        state.onImportOutcomeUnknown();
      }
    }
  } finally {
    finishNativeRequest(state, operation);
  }
}

function beginNativeRequest(state: NativeImportState, stage: Stage): AbortController {
  const operation = new AbortController();
  state.active.current = operation;
  state.setStage(stage);
  state.onPendingChange(true);
  return operation;
}

function finishNativeRequest(state: NativeImportState, operation: AbortController) {
  if (state.active.current === operation) {
    state.active.current = undefined;
    state.setStage('idle');
    state.onPendingChange(false);
  }
}

function cancelNativeImport(state: NativeImportState) {
  state.active.current?.abort();
  state.active.current = undefined;
  state.onPendingChange(false);
  state.onClose();
}

function NativeStoryImportView({ state }: { state: NativeImportState }) {
  const { t } = useTranslation();
  return (
    <>
      <p>{t('library.import.native.description')}</p>
      <label className="form-field form-field--standard choicescript-file-field">
        <span>{t('library.import.native.file')}</span>
        <input
          type="file"
          accept=".json,application/json"
          data-modal-autofocus
          disabled={state.stage !== 'idle'}
          onChange={(event) => {
            void selectNativeFile(state, event.currentTarget.files?.[0]);
          }}
        />
      </label>
      {state.stage === 'checking' ? (
        <p role="status">{t('library.import.native.checking')}</p>
      ) : null}
      {state.summary ? <NativeStorySummary summary={state.summary} /> : null}
      {state.error ? <NativeStoryError error={state.error} /> : null}
      <NativeStoryImportActions state={state} />
    </>
  );
}

function NativeStoryImportActions({ state }: { state: NativeImportState }) {
  const { t } = useTranslation();
  return (
    <div className="dialog-actions">
      <button
        className="product-secondary"
        type="button"
        disabled={state.stage === 'importing'}
        onClick={() => {
          cancelNativeImport(state);
        }}
      >
        {t('library.import.cancel')}
      </button>
      <button
        className="product-primary"
        type="button"
        disabled={!state.summary || state.stage !== 'idle'}
        onClick={() => {
          void createNativeStory(state);
        }}
      >
        {t(
          state.stage === 'importing'
            ? 'library.import.native.importing'
            : 'library.import.native.confirm',
        )}
      </button>
    </div>
  );
}

function NativeStoryError({ error }: { error: ImportError }) {
  const { t } = useTranslation();
  return (
    <div className="library-error" role="alert">
      <p>{error.message}</p>
      {error.outcomeUnknown === true ? <p>{t('library.import.native.outcomeUnknown')}</p> : null}
      {error.path !== undefined && error.path !== '' ? (
        <small>{t('library.import.native.path', { path: error.path })}</small>
      ) : null}
    </div>
  );
}

function importOutcomeMayBeUnknown(caught: unknown): boolean {
  if (!isApiErrorLike(caught)) {
    return true;
  }
  return caught.status === 0 || caught.status >= 500 || caught.code === 'INVALID_SERVER_RESPONSE';
}

function NativeStorySummary({ summary }: { summary: NativeStoryImportSummary }) {
  const { t } = useTranslation();
  const rows: Array<[string, string | number]> = [
    ['library.import.native.interactions', summary.interactionCount],
    ['library.import.native.triggers', summary.triggerCount],
    ['library.import.native.characters', summary.characterCount],
    ['library.import.native.locations', summary.locationCount],
    [
      'library.import.native.items',
      `${summary.itemDefinitionCount} / ${summary.itemInstanceCount}`,
    ],
    [
      'library.import.native.stats',
      `${summary.statDefinitionCount} / ${summary.statAssignmentCount}`,
    ],
    ['library.import.native.groups', summary.groupCount],
    ['library.import.native.decorations', summary.graphDecorationCount],
  ];
  return (
    <div className="choicescript-import-result" aria-live="polite">
      <strong>{summary.title}</strong>
      <dl>
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{t(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function nativeImportError(caught: unknown, t: TFunction): ImportError {
  if (!isApiErrorLike(caught)) {
    return { message: t('library.import.native.failed') };
  }
  const errorKeys: Record<string, string> = {
    INVALID_STRUCTURE: 'structure',
    UNSUPPORTED_VERSION: 'version',
    DUPLICATE_IDENTIFIER: 'duplicate',
    MISSING_REFERENCE: 'reference',
    INVALID_ITEM_DEFINITION: 'reference',
    INVALID_GRAPH: 'graph',
    INVALID_GROUPS: 'graph',
    INVALID_ITEM_PLACEMENT: 'graph',
    INVALID_STATS: 'stats',
    INVALID_CONTENT: 'structure',
    UNSUPPORTED_CONTENT: 'unsupported',
    ID_COLLISION: 'collision',
  };
  const key = caught.code === undefined ? undefined : errorKeys[caught.code];
  const message =
    key !== undefined
      ? t(`library.import.native.errors.${key}`)
      : apiErrorMessage(caught, t, t('library.import.native.failed'));
  const details = caught.details;
  const path =
    typeof details === 'object' &&
    details !== null &&
    'path' in details &&
    typeof details.path === 'string'
      ? details.path
      : undefined;
  return { message, ...(path === undefined ? {} : { path }) };
}
