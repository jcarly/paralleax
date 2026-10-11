import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryGraphSelection } from '../storyGraphSelection';

interface StoryGraphSelectionInspectorProps {
  selection: StoryGraphSelection;
  onCreateGroup: (title: string, interactionIds: string[]) => Promise<boolean>;
}

export function StoryGraphSelectionInspector({
  selection,
  onCreateGroup,
}: StoryGraphSelectionInspectorProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('New group');
  const [isCreating, setIsCreating] = useState(false);
  const interactionIds = selection.interactionIds;

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || interactionIds.length === 0 || isCreating) return;
    setIsCreating(true);
    try {
      const created = await onCreateGroup(nextTitle, interactionIds);
      if (created) setTitle('New group');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="graph-selection-inspector">
      <h2>{t('editor.graphSelection.title')}</h2>
      <p>{t('editor.graphSelection.interactions', { count: selection.interactionIds.length })}</p>
      <p>{t('editor.graphSelection.triggers', { count: selection.triggers.length })}</p>
      <form onSubmit={createGroup}>
        <label>
          {t('editor.graphSelection.groupTitle')}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            disabled={isCreating}
          />
        </label>
        <button type="submit" disabled={interactionIds.length === 0 || !title.trim() || isCreating}>
          {t('editor.graphSelection.createGroup')}
        </button>
        {interactionIds.length === 0 ? <p>{t('editor.graphSelection.groupRequiresInteraction')}</p> : null}
      </form>
    </div>
  );
}
