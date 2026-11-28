import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { InteractionContext } from '../features/story/InteractionContext';
import { ChoiceLabelErrorIcon } from '../features/story/ChoiceLabelError';
import { InteractionLabel } from '../features/story/InteractionLabel';
import { interactionLabelForDisplay } from '../features/story/interactionTitlePresentation';
export interface InteractionNodeData extends Record<string, unknown> {
  title: string;
  body: string;
  selected: boolean;
  occurrenceCount?: number;
  /** One of several choices without its own title: readers would see `Option N`. */
  needsChoiceLabel?: boolean;
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

/**
 * The '+' handles mount only once the editor is editable. React Flow registers
 * handle bounds when it measures a node and does not notice handles mounted
 * later without a size change, which leaves them unable to start a drag. The
 * initial mount is measured normally, so only later changes are reported.
 */
function useCreationHandleRegistration(id: string, hasChild: boolean, hasParent: boolean) {
  const updateNodeInternals = useUpdateNodeInternals();
  const handles = `${String(hasChild)}:${String(hasParent)}`;
  const measuredHandles = useRef(handles);
  useEffect(() => {
    if (measuredHandles.current === handles) {
      return;
    }
    measuredHandles.current = handles;
    updateNodeInternals(id);
  }, [handles, id, updateNodeInternals]);
}

type NodeActionEvent = Pick<MouseEvent<HTMLDivElement>, 'preventDefault' | 'stopPropagation'>;

export function InteractionNode({ id, data }: NodeProps<Node<InteractionNodeData>>) {
  const { t } = useTranslation();
  const d = data;
  useCreationHandleRegistration(id, d.onCreateChild !== undefined, d.onCreateParent !== undefined);
  const rootTriggerId = d.rootTriggerId;
  const authoredTitle = d.title.trim();
  const needsChoiceLabel = d.needsChoiceLabel === true && !authoredTitle;
  const commentEntityTitle =
    authoredTitle || interactionLabelForDisplay({ id, title: d.title, body: d.body });
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
    if (rootTriggerId === undefined || rootTriggerId.length === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    d.onSelectRootTrigger?.(id, rootTriggerId);
  };
  const triggerKeyboardAction =
    (callback: (event: NodeActionEvent) => void) => (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      callback(event);
    };

  return (
    <div
      className={`interaction-node ${d.selected ? 'selected' : ''} ${d.dimmed === true ? 'dimmed' : ''}`}
      data-onboarding-target="interaction"
      data-testid="interaction-node"
    >
      {rootTriggerId !== undefined && rootTriggerId.length > 0 ? (
        <button
          className={`root-trigger-marker nodrag nopan ${d.rootTriggerSelected === true ? 'selected' : ''}`}
          type="button"
          data-trigger-drop-target="true"
          data-interaction-id={id}
          data-trigger-id={rootTriggerId}
          aria-label={t('graph.selectRootTrigger')}
          title={t('graph.rootTrigger')}
          onClick={selectRootTrigger}
        />
      ) : null}
      {rootTriggerId !== undefined &&
      rootTriggerId.length > 0 &&
      (d.rootTriggerCommentCount ?? 0) > 0 ? (
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
      {(d.commentCount ?? 0) > 0 ? (
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
      {authoredTitle || needsChoiceLabel ? (
        <InteractionLabel
          label={authoredTitle}
          className={`interaction-node-label${needsChoiceLabel ? ' choice-label-error' : ''}`}
          leadingIcon="→"
          suffix={
            <>
              {needsChoiceLabel ? <ChoiceLabelErrorIcon /> : null}
              {(d.occurrenceCount ?? 0) > 0 ? (
                <span
                  className="interaction-occurrence-count"
                  aria-label={t('graph.occurrences', { count: d.occurrenceCount })}
                >
                  {d.occurrenceCount}
                </span>
              ) : null}
            </>
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
      {(d.statEffectCount ?? 0) > 0 || (d.itemEffectCount ?? 0) > 0 ? (
        <div
          className="interaction-node-effects"
          role="group"
          aria-label={t('interactionInspector.effects')}
        >
          {(d.statEffectCount ?? 0) > 0 ? (
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
          {(d.itemEffectCount ?? 0) > 0 ? (
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
          data-onboarding-target={d.onboardingBranchAdd === true ? 'branch-add' : undefined}
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
