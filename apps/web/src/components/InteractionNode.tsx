import type { KeyboardEvent, MouseEvent } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { InteractionContext } from '../features/story/InteractionContext';
import { InteractionLabel } from '../features/story/InteractionLabel';
export interface InteractionNodeData extends Record<string, unknown> {
  title: string;
  body: string;
  selected: boolean;
  occurrenceCount?: number;
  dimmed?: boolean;
  location?: { id: string; name: string };
  characters?: Array<{ id: string; name: string; imageUrl?: string }>;
  statEffectCount?: number;
  itemEffectCount?: number;
  rootTriggerId?: string;
  onboardingBranchAdd?: boolean;
  rootTriggerSelected?: boolean;
  rootTriggerCommentCount?: number;
  onCreateChild?: (interactionId: string) => void;
  onCreateParent?: (interactionId: string) => void;
  onSelectRootTrigger?: (interactionId: string, triggerId: string) => void;
  commentCount?: number;
  onOpenComments?: (targetType: 'interaction' | 'trigger', targetId: string) => void;
}

const routingHandles = [Position.Top, Position.Right, Position.Bottom, Position.Left];
type NodeActionEvent = Pick<MouseEvent<HTMLDivElement>, 'preventDefault' | 'stopPropagation'>;

export function InteractionNode({ id, data }: NodeProps<Node<InteractionNodeData>>) {
  const { t } = useTranslation();
  const d = data;
  const rootTriggerId = d.rootTriggerId;
  const fallbackTitle = t(
    rootTriggerId
      ? 'interactionInspector.startTitlePlaceholder'
      : 'interactionInspector.newTitlePlaceholder',
  );
  const authoredTitle = d.title.trim();
  const title = authoredTitle || (rootTriggerId ? fallbackTitle : '');
  const commentEntityTitle = authoredTitle || fallbackTitle;
  const characters = d.characters ?? [];
  const createParent = (event: NodeActionEvent) => {
    event.preventDefault();
    event.stopPropagation();
    d.onCreateParent?.(id);
  };
  const createChild = (event: NodeActionEvent) => {
    event.preventDefault();
    event.stopPropagation();
    d.onCreateChild?.(id);
  };
  const selectRootTrigger = (event: MouseEvent<HTMLButtonElement>) => {
    if (!rootTriggerId) return;
    event.preventDefault();
    event.stopPropagation();
    d.onSelectRootTrigger?.(id, rootTriggerId);
  };
  const triggerKeyboardAction =
    (callback: (event: NodeActionEvent) => void) => (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      callback(event);
    };

  return (
    <div
      className={`interaction-node ${d.selected ? 'selected' : ''} ${d.dimmed ? 'dimmed' : ''}`}
      data-onboarding-target="interaction"
      data-testid="interaction-node"
    >
      {rootTriggerId ? (
        <button
          className={`root-trigger-marker nodrag nopan ${d.rootTriggerSelected ? 'selected' : ''}`}
          type="button"
          data-trigger-drop-target="true"
          data-interaction-id={id}
          data-trigger-id={rootTriggerId}
          aria-label={t('graph.selectRootTrigger')}
          title={t('graph.rootTrigger')}
          onClick={selectRootTrigger}
        />
      ) : null}
      {rootTriggerId && d.rootTriggerCommentCount ? (
        <button
          className="root-trigger-comment-badge nodrag nopan"
          type="button"
          aria-label={t('comments.openForTrigger', { count: d.rootTriggerCommentCount })}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            d.onOpenComments?.('trigger', rootTriggerId);
          }}
        >
          <span aria-hidden="true">◆</span>
          {d.rootTriggerCommentCount}
        </button>
      ) : null}
      {d.commentCount ? (
        <button
          className="node-comment-badge nodrag nopan"
          type="button"
          aria-label={t('comments.openForEntity', {
            count: d.commentCount,
            entity: commentEntityTitle,
          })}
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
          aria-label={t('graph.createSourceOrTrigger')}
          title={t('graph.createSourceOrTrigger')}
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
          isConnectable={false}
        />
      ))}
      {title ? (
        <InteractionLabel
          label={title}
          className="interaction-node-label"
          leadingIcon="→"
          suffix={
            d.occurrenceCount ? (
              <span
                className="interaction-occurrence-count"
                aria-label={t('graph.occurrences', { count: d.occurrenceCount })}
              >
                {d.occurrenceCount}
              </span>
            ) : null
          }
        />
      ) : null}
      {d.location || characters.length > 0 ? (
        <InteractionContext location={d.location} characters={characters} variant="graph" />
      ) : null}
      <span className="interaction-excerpt">
        {d.body
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()}
      </span>
      {d.statEffectCount || d.itemEffectCount ? (
        <div
          className="interaction-node-effects"
          role="group"
          aria-label={t('interactionInspector.effects')}
        >
          {d.statEffectCount ? (
            <div
              className="interaction-node-effect"
              role="img"
              aria-label={`${t('interactionInspector.statEffects')}: ${d.statEffectCount}`}
              title={t('interactionInspector.statEffects')}
            >
              <i className="interaction-node-effect-icon" aria-hidden="true">
                Δ
              </i>
              {d.statEffectCount}
            </div>
          ) : null}
          {d.itemEffectCount ? (
            <div
              className="interaction-node-effect"
              role="img"
              aria-label={`${t('interactionInspector.itemEffects')}: ${d.itemEffectCount}`}
              title={t('interactionInspector.itemEffects')}
            >
              <i className="interaction-node-effect-icon" aria-hidden="true">
                ◇
              </i>
              {d.itemEffectCount}
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
          data-onboarding-target={d.onboardingBranchAdd ? 'branch-add' : undefined}
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
          isConnectable={false}
        />
      ))}
    </div>
  );
}
