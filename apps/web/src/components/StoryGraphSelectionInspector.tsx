import { useState } from 'react';
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
  const [isCreating, setIsCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const interactionIds = selection.interactionIds;

  async function createGroup() {
    if (interactionIds.length === 0 || isCreating) return;
    setIsCreating(true);
    setCreated(false);
    try {
      const created = await onCreateGroup(t('editor.groups.newGroup'), interactionIds);
      if (created) {
        setCreated(true);
      }
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="graph-selection-inspector">
      <h2>{t('editor.graphSelection.title')}</h2>
      <p>{t('editor.graphSelection.interactions', { count: selection.interactionIds.length })}</p>
      <p>{t('editor.graphSelection.triggers', { count: selection.triggers.length })}</p>
      <button
        type="button"
        onClick={() => void createGroup()}
        disabled={interactionIds.length === 0 || isCreating}
      >
        {t('editor.graphSelection.createGroup')}
      </button>
      {interactionIds.length === 0 ? (
        <p>{t('editor.graphSelection.groupRequiresInteraction')}</p>
      ) : null}
      {created ? <p role="status">{t('editor.groups.created')}</p> : null}
    </div>
  );
}
