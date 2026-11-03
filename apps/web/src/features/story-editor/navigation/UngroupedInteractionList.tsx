import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { Interaction } from '@paralleax/shared';
import { StoryInteractionRow } from './StoryInteractionRow';

interface UngroupedInteractionListProps {
  interactions: readonly Interaction[];
  searchQuery: string;
  matchingInteractionIds: ReadonlySet<string>;
  selectedInteractionId?: string;
  onSelect: (interactionId: string) => void;
}

export function UngroupedInteractionList(props: UngroupedInteractionListProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [collapsedSearchQuery, setCollapsedSearchQuery] = useState<string | undefined>(undefined);
  const searching = Boolean(props.searchQuery.trim());
  const results = filterInteractions(props.interactions, searching, props.matchingInteractionIds);
  if (!results.length) {
    return null;
  }
  const open = searching ? collapsedSearchQuery !== props.searchQuery : expanded;

  return (
    <section className="story-ungrouped-interactions" aria-label={t('editor.groups.ungrouped')}>
      <button
        type="button"
        className="ghost story-ungrouped-toggle"
        aria-expanded={open}
        onClick={() =>
          toggleList({
            searching,
            open,
            query: props.searchQuery,
            setExpanded,
            setCollapsedQuery: setCollapsedSearchQuery,
          })
        }
      >
        <span aria-hidden="true">{open ? 'â–¾' : 'â–¸'}</span>
        <span>{t('editor.groups.ungroupedCount', { count: results.length })}</span>
      </button>
      {open ? (
        <UngroupedInteractionRows
          interactions={results}
          selectedInteractionId={props.selectedInteractionId}
          onSelect={props.onSelect}
        />
      ) : null}
    </section>
  );
}

function filterInteractions(
  interactions: readonly Interaction[],
  searching: boolean,
  matchingIds: ReadonlySet<string>,
) {
  if (!searching) {
    return interactions;
  }
  return interactions.filter(({ id }) => matchingIds.has(id));
}

function toggleList({
  searching,
  open,
  query,
  setExpanded,
  setCollapsedQuery,
}: {
  searching: boolean;
  open: boolean;
  query: string;
  setExpanded: Dispatch<SetStateAction<boolean>>;
  setCollapsedQuery: Dispatch<SetStateAction<string | undefined>>;
}) {
  if (searching) {
    setCollapsedQuery(open ? query : undefined);
    return;
  }
  setExpanded((value) => !value);
}

function UngroupedInteractionRows({
  interactions,
  selectedInteractionId,
  onSelect,
}: {
  interactions: readonly Interaction[];
  selectedInteractionId?: string;
  onSelect: (interactionId: string) => void;
}) {
  return (
    <div className="story-ungrouped-list">
      {interactions.map((interaction) => (
        <StoryInteractionRow
          key={interaction.id}
          interaction={interaction}
          depth={0}
          selected={selectedInteractionId === interaction.id}
          onSelect={() => onSelect(interaction.id)}
        />
      ))}
    </div>
  );
}
