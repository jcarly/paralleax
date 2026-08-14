import type { KeyboardEvent, MouseEvent } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
export interface InteractionNodeData extends Record<string, unknown> {
  title: string;
  body: string;
  selected: boolean;
  occurrenceCount?: number;
  dimmed?: boolean;
  location?: { id: string; name: string };
  characters?: Array<{ id: string; name: string; imageUrl?: string }>;
  rootTriggerId?: string;
  rootTriggerSelected?: boolean;
  rootTriggerCommentCount?: number;
  showNewTriggerInput?: boolean;
  onCreateChild?: (interactionId: string) => void;
  onCreateParent?: (interactionId: string) => void;
  onSelectRootTrigger?: (interactionId: string, triggerId: string) => void;
  commentCount?: number;
  onOpenComments?: (targetType: 'interaction' | 'trigger', targetId: string) => void;
}

const routingHandles = [Position.Top, Position.Right, Position.Bottom, Position.Left];

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase();
}

export function InteractionNode({ id, data }: NodeProps) {
  const { t } = useTranslation();
  const d = data as InteractionNodeData;
  const characters = d.characters ?? [];
  const visibleCharacters = characters.slice(0, 3);
  const createParent = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    d.onCreateParent?.(id);
  };
  const createChild = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    d.onCreateChild?.(id);
  };
  const selectRootTrigger = (event: MouseEvent<HTMLButtonElement>) => {
    if (!d.rootTriggerId) return;
    event.preventDefault();
    event.stopPropagation();
    d.onSelectRootTrigger?.(id, d.rootTriggerId);
  };
  const triggerKeyboardAction =
    (callback: (event: MouseEvent<HTMLDivElement>) => void) =>
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      callback(event as unknown as MouseEvent<HTMLDivElement>);
    };

  return (
    <div
      className={`interaction-node ${d.selected ? 'selected' : ''} ${d.dimmed ? 'dimmed' : ''}`}
      data-testid="interaction-node"
    >
      {d.rootTriggerId ? (
        <button
          className={`root-trigger-marker nodrag nopan ${d.rootTriggerSelected ? 'selected' : ''}`}
          type="button"
          data-trigger-drop-target="true"
          data-interaction-id={id}
          data-trigger-id={d.rootTriggerId}
          aria-label={t('graph.selectRootTrigger')}
          title={t('graph.rootTrigger')}
          onClick={selectRootTrigger}
        />
      ) : null}
      {d.rootTriggerId && d.rootTriggerCommentCount ? (
        <button
          className="root-trigger-comment-badge nodrag nopan"
          type="button"
          aria-label={t('comments.openForTrigger', { count: d.rootTriggerCommentCount })}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            d.onOpenComments?.('trigger', d.rootTriggerId!);
          }}
        >
          {d.rootTriggerCommentCount}
        </button>
      ) : null}
      {d.commentCount ? (
        <button
          className="node-comment-badge nodrag nopan"
          type="button"
          aria-label={t('comments.openForEntity', { count: d.commentCount, entity: d.title })}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            d.onOpenComments?.('interaction', id);
          }}
        >
          <span aria-hidden="true">◆</span>
          {d.commentCount}
        </button>
      ) : null}
      {d.onCreateParent ? (
        <Handle
          type="target"
          id="create-source-input"
          position={Position.Top}
          className="node-create node-create-parent nodrag nopan"
          role="button"
          tabIndex={0}
          aria-label={t('graph.createSource')}
          title={t('graph.createSource')}
          onClick={createParent}
          onKeyDown={triggerKeyboardAction(createParent)}
        >
          +
        </Handle>
      ) : null}
      {routingHandles.map((position) => (
        <Handle
          key={`input-${position}`}
          type="target"
          id={`routing-input-${position}`}
          position={position}
          className="routing-handle"
        />
      ))}
      <Handle
        type="target"
        id="new-trigger-input"
        position={Position.Top}
        className={`node-trigger-input nodrag nopan ${d.showNewTriggerInput ? 'is-visible' : ''}`}
        aria-label={t('graph.createTriggerInput')}
        title={t('graph.createTrigger')}
      />
      <strong>
        {d.title}
        {d.occurrenceCount ? (
          <span
            className="interaction-occurrence-count"
            aria-label={t('graph.occurrences', { count: d.occurrenceCount })}
          >
            {d.occurrenceCount}
          </span>
        ) : null}
      </strong>
      <span className="interaction-excerpt">
        {d.body
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()}
      </span>
      {d.location || characters.length > 0 ? (
        <div className="interaction-node-context">
          {d.location ? (
            <span className="interaction-node-location" title={d.location.name}>
              <span aria-hidden="true">⌖</span>
              {d.location.name}
            </span>
          ) : null}
          {characters.length > 0 ? (
            <div
              className="interaction-node-characters"
              aria-label={t('graph.charactersPresent', {
                names: characters.map(({ name }) => name).join(', '),
              })}
            >
              {visibleCharacters.map((character) => (
                <span
                  className="interaction-node-character"
                  title={character.name}
                  aria-hidden="true"
                  key={character.id}
                >
                  {character.imageUrl ? (
                    <img src={character.imageUrl} alt="" />
                  ) : (
                    getInitials(character.name)
                  )}
                </span>
              ))}
              {characters.length > visibleCharacters.length ? (
                <span
                  className="interaction-node-character interaction-node-character-overflow"
                  title={t('graph.moreCharacters', {
                    count: characters.length - visibleCharacters.length,
                  })}
                  aria-hidden="true"
                >
                  +{characters.length - visibleCharacters.length}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {d.onCreateChild ? (
        <Handle
          type="source"
          id="interaction-output"
          position={Position.Bottom}
          className="node-create node-create-child nodrag nopan"
          role="button"
          tabIndex={0}
          aria-label={t('graph.createChild')}
          title={t('graph.createChild')}
          onClick={createChild}
          onKeyDown={triggerKeyboardAction(createChild)}
        >
          +
        </Handle>
      ) : null}
      {routingHandles.map((position) => (
        <Handle
          key={`output-${position}`}
          type="source"
          id={`routing-output-${position}`}
          position={position}
          className="routing-handle"
        />
      ))}
    </div>
  );
}
