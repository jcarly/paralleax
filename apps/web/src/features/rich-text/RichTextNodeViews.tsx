import { getStatTargets, type TriggerCondition } from '@paralleax/shared';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import type { MouseEvent } from 'react';
import { statTargetPathLabel } from '../../storyStats';
import { describeTriggerCondition } from '../../triggerConditionPresentation';
import { readTriggerConditions } from './richTextEditorCommands';
import type { RichTextExtensionContext } from './richTextEditorTypes';

export function StatValueNodeView({ node, editor, extension, getPos }: NodeViewProps) {
  const context = extensionContext(extension);
  if (!context) {
    return null;
  }
  const assignmentId = nodeString(node, 'assignmentId');
  const itemId = nodeString(node, 'itemId') || undefined;
  const sourceText = nodeString(node, 'sourceText');
  const target = findStatTarget(context, assignmentId, itemId);
  const label = variableLabel(context, target, sourceText, assignmentId);
  const position = getNodePosition(getPos);
  return (
    <NodeViewWrapper
      as="span"
      className="rich-text-token rich-text-variable-token"
      contentEditable={false}
      data-comment-value={sourceText}
      data-stat-value={assignmentId}
      data-stat-item={itemId}
    >
      <TokenActions
        editLabel={context.t('richText.editVariableToken', { reference: label })}
        removeLabel={context.t('richText.removeVariableToken', { reference: label })}
        onEdit={() => {
          if (position !== undefined) {
            context.onEditVariable(position, assignmentId, itemId);
          }
        }}
        onRemove={() => deleteNode(editor, position, node.nodeSize)}
      >
        {label}
      </TokenActions>
    </NodeViewWrapper>
  );
}

export function InteractionLinkNodeView({ node, editor, extension, getPos }: NodeViewProps) {
  const context = extensionContext(extension);
  if (!context) {
    return null;
  }
  const targetId = nodeString(node, 'targetId');
  const text = nodeString(node, 'text');
  const target =
    context.interactionLinkTargets.find((candidate) => candidate.id === targetId)?.title ??
    targetId;
  const position = getNodePosition(getPos);
  return (
    <NodeViewWrapper
      as="span"
      className="rich-text-token rich-text-interaction-link-token"
      contentEditable={false}
      data-comment-value={text}
      data-interaction-link-target={targetId}
    >
      <TokenActions
        editLabel={context.t('richText.editInteractionLinkToken', { text, target })}
        removeLabel={context.t('richText.removeInteractionLinkToken', { text, target })}
        onEdit={() => {
          if (position !== undefined) {
            context.onEditInteractionLink(position, text, targetId);
          }
        }}
        onRemove={() => deleteNode(editor, position, node.nodeSize)}
      >{`🔗 ${text} | ${target}`}</TokenActions>
    </NodeViewWrapper>
  );
}

export function ConditionalTextNodeView({ node, extension }: NodeViewProps) {
  const context = extensionContext(extension);
  if (!context) {
    return null;
  }
  const blockId = nodeString(node, 'blockId');
  const conditions = readTriggerConditions(node);
  const inline = node.type.name === 'conditionalTextInline';
  return (
    <NodeViewWrapper
      as={inline ? 'span' : 'div'}
      className="conditional-text rich-text-conditional-frame"
      data-conditional-text-block={blockId}
    >
      <ConditionControls blockId={blockId} conditions={conditions} context={context} />
      {inline ? (
        <NodeViewContent<'span'> as="span" className="rich-text-conditional-content" />
      ) : (
        <NodeViewContent className="rich-text-conditional-content" />
      )}
    </NodeViewWrapper>
  );
}

function ConditionControls({
  blockId,
  conditions,
  context,
}: {
  blockId: string;
  conditions: TriggerCondition[];
  context: RichTextExtensionContext;
}) {
  return (
    <span
      className="rich-text-conditional-controls"
      contentEditable={false}
      data-comment-exclude="true"
    >
      {conditions.map((condition, index) => (
        <ConditionControl
          key={`${blockId}-${index}`}
          blockId={blockId}
          condition={condition}
          index={index}
          context={context}
        />
      ))}
      <button
        aria-label={context.t('richText.addAnotherCondition')}
        className="rich-text-condition-add"
        contentEditable={false}
        title={context.t('richText.addAnotherCondition')}
        type="button"
        onMouseDown={keepEditorFocus}
        onClick={() => context.onAddConditionalCondition(blockId)}
      >
        +
      </button>
    </span>
  );
}

function ConditionControl({
  blockId,
  condition,
  index,
  context,
}: {
  blockId: string;
  condition: TriggerCondition;
  index: number;
  context: RichTextExtensionContext;
}) {
  const label = context.story ? describeTriggerCondition(context.story, condition, context.t) : '';
  return (
    <span className="rich-text-condition-token">
      <button
        aria-label={context.t('richText.editConditionToken')}
        className="rich-text-condition-edit"
        contentEditable={false}
        type="button"
        onMouseDown={keepEditorFocus}
        onClick={() => context.onEditConditionalCondition(blockId, index)}
      >
        {label}
      </button>
      <button
        aria-label={context.t('richText.removeConditionToken')}
        className="rich-text-condition-remove"
        contentEditable={false}
        title={context.t('richText.removeConditionToken')}
        type="button"
        onMouseDown={keepEditorFocus}
        onClick={() => context.onRemoveConditionalCondition(blockId, index)}
      >
        ×
      </button>
    </span>
  );
}

function TokenActions({
  editLabel,
  removeLabel,
  onEdit,
  onRemove,
  children,
}: {
  editLabel: string;
  removeLabel: string;
  onEdit: () => void;
  onRemove: () => void;
  children: string;
}) {
  return (
    <>
      <button
        aria-label={editLabel}
        className="rich-text-token-edit"
        contentEditable={false}
        draggable
        type="button"
        onMouseDown={keepEditorFocus}
        onClick={onEdit}
      >
        {children}
      </button>
      <button
        aria-label={removeLabel}
        className="rich-text-token-remove"
        contentEditable={false}
        title={removeLabel}
        type="button"
        onMouseDown={keepEditorFocus}
        onClick={onRemove}
      >
        ×
      </button>
    </>
  );
}

function extensionContext(
  extension: NodeViewProps['extension'],
): RichTextExtensionContext | undefined {
  const options: unknown = extension.options;
  const store = readProperty(options, 'contextStore');
  const value = readProperty(store, 'current');
  return isExtensionContext(value) ? value : undefined;
}

function isExtensionContext(value: unknown): value is RichTextExtensionContext {
  return (
    isRecord(value) &&
    typeof value.t === 'function' &&
    Array.isArray(value.interactionLinkTargets) &&
    Array.isArray(value.conditionalTextBlocks) &&
    typeof value.onEditVariable === 'function' &&
    typeof value.onEditInteractionLink === 'function' &&
    typeof value.onAddConditionalCondition === 'function' &&
    typeof value.onEditConditionalCondition === 'function' &&
    typeof value.onRemoveConditionalCondition === 'function'
  );
}

function readProperty(value: unknown, key: string): unknown {
  return isRecord(value) && key in value ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nodeString(node: NodeViewProps['node'], name: string) {
  const value: unknown = node.attrs[name];
  return typeof value === 'string' ? value : '';
}

function findStatTarget(
  context: RichTextExtensionContext,
  assignmentId: string,
  itemId: string | undefined,
) {
  return context.story
    ? getStatTargets(context.story).find(
        (target) => target.assignment.id === assignmentId && target.itemId === itemId,
      )
    : undefined;
}

function variableLabel(
  context: RichTextExtensionContext,
  target: ReturnType<typeof findStatTarget>,
  sourceText: string,
  assignmentId: string,
) {
  if (target) {
    return statTargetPathLabel(target, context.t('attributes.owner.story'));
  }
  const source = sourceText.replace(/^\{\{|\}\}$/g, '').replaceAll('.', ' -> ');
  return source || assignmentId;
}

function getNodePosition(getPos: NodeViewProps['getPos']) {
  const position = getPos();
  return typeof position === 'number' ? position : undefined;
}

function deleteNode(editor: NodeViewProps['editor'], position: number | undefined, size: number) {
  if (position !== undefined) {
    editor.commands.deleteRange({ from: position, to: position + size });
  }
}

function keepEditorFocus(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}
