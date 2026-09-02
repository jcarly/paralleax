import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_MANUAL_READER_SAVES,
  MAX_READER_SAVE_NAME_LENGTH,
  type ReaderProgressState,
  type ReaderSave,
  type ReaderSaveSummary,
  type Story,
} from '@paralleax/shared';
import { api } from '../../api';

export function ReaderSaveDialog({
  story,
  session,
  onClose,
  onLoad,
}: {
  story: Story;
  session: ReaderProgressState;
  onClose: () => void;
  onLoad: (save: ReaderSave) => void;
}) {
  const { t } = useTranslation();
  const [saves, setSaves] = useState<ReaderSaveSummary[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState('');
  const manualCount = saves.filter(({ kind }) => kind === 'manual').length;

  useEffect(() => {
    let cancelled = false;
    void api
      .listReaderSaves(story.id)
      .then((nextSaves) => {
        if (!cancelled) setSaves(nextSaves);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(message(caught, t('player.saves.loadListFailed')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [story.id, t]);

  const interactionTitles = useMemo(
    () => new Map(story.interactions.map(({ id, title }) => [id, title])),
    [story.interactions],
  );

  const snapshot = {
    journeyInteractionIds: session.journeyInteractionIds,
    ownedItemIds: session.ownedItemIds,
    ...(session.randomSeed ? { randomSeed: session.randomSeed } : {}),
    ...(session.stepStartedAt ? { stepStartedAt: session.stepStartedAt } : {}),
  };

  async function create(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setPending('create');
    setError('');
    try {
      const save = await api.createReaderSave(story.id, { ...snapshot, name: trimmedName });
      setSaves((current) => [summary(save), ...current]);
      setName('');
    } catch (caught) {
      setError(message(caught, t('player.saves.createFailed')));
    } finally {
      setPending(undefined);
    }
  }

  async function load(saveId: string) {
    setPending(`load:${saveId}`);
    setError('');
    try {
      onLoad(await api.getReaderSave(story.id, saveId));
      onClose();
    } catch (caught) {
      setError(message(caught, t('player.saves.loadFailed')));
    } finally {
      setPending(undefined);
    }
  }

  async function overwrite(save: ReaderSaveSummary) {
    if (save.kind !== 'manual' || !save.name) return;
    setPending(`overwrite:${save.id}`);
    setError('');
    try {
      const updated = await api.updateReaderSave(story.id, save.id, {
        ...snapshot,
        name: save.name,
      });
      setSaves((current) => current.map((item) => (item.id === save.id ? summary(updated) : item)));
    } catch (caught) {
      setError(message(caught, t('player.saves.overwriteFailed')));
    } finally {
      setPending(undefined);
    }
  }

  async function remove(save: ReaderSaveSummary) {
    if (save.kind !== 'manual' || !window.confirm(t('player.saves.deleteConfirm'))) return;
    setPending(`delete:${save.id}`);
    setError('');
    try {
      await api.deleteReaderSave(story.id, save.id);
      setSaves((current) => current.filter(({ id }) => id !== save.id));
    } catch (caught) {
      setError(message(caught, t('player.saves.deleteFailed')));
    } finally {
      setPending(undefined);
    }
  }

  return (
    <div className="modal-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal-dialog reader-save-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-save-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="reader-save-dialog-header">
          <div>
            <span className="product-eyebrow">{t('player.saves.eyebrow')}</span>
            <h2 id="reader-save-dialog-title">{t('player.saves.title')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('player.saves.close')}>
            ×
          </button>
        </div>

        <form className="reader-save-create" onSubmit={(event) => void create(event)}>
          <label>
            <span>{t('player.saves.name')}</span>
            <input
              value={name}
              maxLength={MAX_READER_SAVE_NAME_LENGTH}
              placeholder={t('player.saves.namePlaceholder')}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={
              !name.trim() || pending !== undefined || manualCount >= MAX_MANUAL_READER_SAVES
            }
          >
            {pending === 'create' ? t('player.saves.saving') : t('player.saves.create')}
          </button>
        </form>
        <small className="reader-save-limit">
          {t('player.saves.limit', { count: manualCount, max: MAX_MANUAL_READER_SAVES })}
        </small>

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? <p>{t('player.saves.loading')}</p> : null}
        {!loading && saves.length === 0 ? <p>{t('player.saves.empty')}</p> : null}
        {!loading && saves.length > 0 ? (
          <div className="reader-save-list">
            {saves.map((save) => {
              const currentTitle = save.currentInteractionId
                ? interactionTitles.get(save.currentInteractionId)
                : undefined;
              return (
                <article key={save.id}>
                  <div>
                    <strong>{saveLabel(save, t)}</strong>
                    <small>
                      {currentTitle ?? t('player.saves.beforeStart')} ·{' '}
                      {t('player.saves.steps', { count: save.journeyLength })}
                    </small>
                    <time dateTime={save.updatedAt}>
                      {new Date(save.updatedAt).toLocaleString()}
                    </time>
                  </div>
                  <div className="reader-save-actions">
                    <button
                      type="button"
                      disabled={pending !== undefined}
                      onClick={() => void load(save.id)}
                    >
                      {pending === `load:${save.id}`
                        ? t('player.saves.loadingSave')
                        : t('player.saves.load')}
                    </button>
                    {save.kind === 'manual' ? (
                      <>
                        <button
                          type="button"
                          disabled={pending !== undefined}
                          onClick={() => void overwrite(save)}
                        >
                          {t('player.saves.overwrite')}
                        </button>
                        <button
                          type="button"
                          disabled={pending !== undefined}
                          onClick={() => void remove(save)}
                        >
                          {t('player.saves.delete')}
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function saveLabel(
  save: ReaderSaveSummary,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (save.kind === 'reader-autosave') return t('player.saves.readerAutosave');
  if (save.kind === 'simulation-autosave') return t('player.saves.simulationAutosave');
  return save.name ?? t('player.saves.manual');
}

function summary(save: ReaderSave): ReaderSaveSummary {
  return {
    id: save.id,
    kind: save.kind,
    ...(save.name ? { name: save.name } : {}),
    currentInteractionId: save.state.currentInteractionId,
    journeyLength: save.state.journeyInteractionIds.length,
    createdAt: save.createdAt,
    updatedAt: save.updatedAt,
  };
}

function message(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}
