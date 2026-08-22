import { useTranslation } from 'react-i18next';
import type { StoryGraphSelection } from '../storyGraphSelection';

export function StoryGraphSelectionInspector({ selection }: { selection: StoryGraphSelection }) {
  const { t } = useTranslation();

  return (
    <div className="graph-selection-inspector">
      <h2>{t('editor.graphSelection.title')}</h2>
      <p>{t('editor.graphSelection.interactions', { count: selection.interactionIds.length })}</p>
      <p>{t('editor.graphSelection.triggers', { count: selection.triggers.length })}</p>
    </div>
  );
}
