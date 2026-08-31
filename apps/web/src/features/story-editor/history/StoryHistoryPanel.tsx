import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  storyHistoryOperations,
  type StoryHistory,
  type StoryHistoryEntry,
} from '@paralleax/shared';
import { CanvasActionIcon } from '../../../components/StoryCanvasToolbar';

interface StoryHistoryPanelProps {
  history: StoryHistory;
  busy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
}

const operationTranslationKeys = {
  [storyHistoryOperations.storyUpdated]: 'storyUpdated',
  [storyHistoryOperations.storyMetadataUpdated]: 'storyMetadataUpdated',
  [storyHistoryOperations.interactionCreated]: 'interactionCreated',
  [storyHistoryOperations.interactionUpdated]: 'interactionUpdated',
  [storyHistoryOperations.interactionDeleted]: 'interactionDeleted',
  [storyHistoryOperations.graphPositionsUpdated]: 'graphPositionsUpdated',
  [storyHistoryOperations.triggerCreated]: 'triggerCreated',
  [storyHistoryOperations.triggerUpdated]: 'triggerUpdated',
  [storyHistoryOperations.triggerDeleted]: 'triggerDeleted',
  [storyHistoryOperations.graphDecorationCreated]: 'graphDecorationCreated',
  [storyHistoryOperations.graphDecorationUpdated]: 'graphDecorationUpdated',
  [storyHistoryOperations.graphDecorationDeleted]: 'graphDecorationDeleted',
  [storyHistoryOperations.locationCreated]: 'locationCreated',
  [storyHistoryOperations.locationUpdated]: 'locationUpdated',
  [storyHistoryOperations.characterCreated]: 'characterCreated',
  [storyHistoryOperations.characterUpdated]: 'characterUpdated',
  [storyHistoryOperations.statDefinitionCreated]: 'statDefinitionCreated',
  [storyHistoryOperations.statDefinitionUpdated]: 'statDefinitionUpdated',
  [storyHistoryOperations.statDefinitionDeleted]: 'statDefinitionDeleted',
  [storyHistoryOperations.statAssignmentCreated]: 'statAssignmentCreated',
  [storyHistoryOperations.statAssignmentUpdated]: 'statAssignmentUpdated',
  [storyHistoryOperations.statAssignmentDeleted]: 'statAssignmentDeleted',
  [storyHistoryOperations.itemDefinitionCreated]: 'itemDefinitionCreated',
  [storyHistoryOperations.itemDefinitionUpdated]: 'itemDefinitionUpdated',
  [storyHistoryOperations.itemInstanceCreated]: 'itemInstanceCreated',
  [storyHistoryOperations.itemInstanceMoved]: 'itemInstanceMoved',
  [storyHistoryOperations.itemInstanceDeleted]: 'itemInstanceDeleted',
} as const;

export function StoryHistoryPanel({
  history,
  busy,
  onUndo,
  onRedo,
  onClose,
}: StoryHistoryPanelProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const groups = useMemo(
    () => groupEntriesByDay(history.entries, locale),
    [history.entries, locale],
  );

  return (
    <aside className="story-history-panel" aria-label={t('editor.history.title')}>
      <header className="story-history-header">
        <div>
          <span className="product-eyebrow">{t('editor.history.eyebrow')}</span>
          <h2>{t('editor.history.title')}</h2>
        </div>
        <button
          type="button"
          className="ghost story-history-close"
          aria-label={t('editor.history.close')}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="story-history-actions">
        <button type="button" disabled={!history.canUndo || busy} onClick={onUndo}>
          <CanvasActionIcon name="undo" />
          {t('editor.history.undo')}
        </button>
        <button type="button" disabled={!history.canRedo || busy} onClick={onRedo}>
          <CanvasActionIcon name="redo" />
          {t('editor.history.redo')}
        </button>
      </div>

      <div className="story-history-scroll" aria-live="polite">
        {groups.length === 0 ? (
          <p className="story-history-empty">{t('editor.history.empty')}</p>
        ) : (
          groups.map((group) => (
            <section className="story-history-day" key={group.key}>
              <h3>{group.label}</h3>
              <ol>
                {group.entries.map((entry) => (
                  <li key={entry.id} className={entry.reverted ? 'is-reverted' : undefined}>
                    <div className="story-history-entry-heading">
                      <strong>{historyEntryLabel(entry, t)}</strong>
                      {entry.reverted ? (
                        <span className="story-history-reverted">
                          {t('editor.history.reverted')}
                        </span>
                      ) : null}
                    </div>
                    <div className="story-history-entry-meta">
                      <span>
                        {entry.actor?.email ?? entry.actor?.id ?? t('editor.history.unknownActor')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <time
                        dateTime={entry.createdAt}
                        title={formatFullDate(entry.createdAt, locale)}
                      >
                        {formatTime(entry.createdAt, locale)}
                      </time>
                      <span aria-hidden="true">·</span>
                      <span>{t('editor.history.revision', { revision: entry.revision })}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

function historyEntryLabel(
  entry: StoryHistoryEntry,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  const key = operationTranslationKeys[entry.operation as keyof typeof operationTranslationKeys];
  const operation = key
    ? t(`editor.history.operations.${key}`)
    : humanizeUnknownOperation(entry.operation);
  if (entry.kind === 'undo') return t('editor.history.undid', { operation });
  if (entry.kind === 'redo') return t('editor.history.redid', { operation });
  return operation;
}

function humanizeUnknownOperation(operation: string): string {
  const words = operation.replace(/[.-]+/g, ' ').trim();
  return words ? `${words[0].toLocaleUpperCase()}${words.slice(1)}` : operation;
}

function groupEntriesByDay(entries: StoryHistoryEntry[], locale: string) {
  const groups = new Map<string, { key: string; label: string; entries: StoryHistoryEntry[] }>();
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  for (const entry of [...entries].sort((left, right) => right.revision - left.revision)) {
    const date = new Date(entry.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const group = groups.get(key) ?? { key, label: dateFormatter.format(date), entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function formatTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function formatFullDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'medium' }).format(
    new Date(value),
  );
}
