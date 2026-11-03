import {
  getStatTargets,
  type StatTarget,
  type Story,
  type TriggerCondition,
} from '@paralleax/shared';
import type { Editor } from '@tiptap/core';
import { RichTextConditionDialog } from '../../components/RichTextConditionDialog';
import {
  RichTextInteractionLinkDialog,
  type RichTextInteractionLinkValue,
} from '../../components/RichTextInteractionLinkDialog';
import { RichTextVariableDialog } from '../../components/RichTextVariableDialog';
import type { ConditionalEdit, EditingLink, EditingVariable } from './richTextEditorTypes';
import { variableReferenceFromEditor } from './richTextEditorCommands';

type RichTextEditorDialogsProps = {
  editor: Editor | null;
  story?: Story;
  interactionId?: string;
  interactionLinkTargets: { id: string; title: string }[];
  editingVariable: EditingVariable | undefined;
  editingLink: EditingLink | undefined;
  linkSelectionText: string;
  conditionalEdit: ConditionalEdit | undefined;
  currentCondition?: TriggerCondition;
  onCancelVariable: () => void;
  onConfirmVariable: (target: StatTarget, reference: string) => void;
  onCancelLink: () => void;
  onConfirmLink: (link: RichTextInteractionLinkValue) => void;
  onCancelCondition: () => void;
  onConfirmCondition: (condition: TriggerCondition) => void;
};

export function RichTextEditorDialogs(props: RichTextEditorDialogsProps) {
  return (
    <>
      <VariableDialog {...props} />
      <InteractionLinkDialog {...props} />
      <ConditionalDialog {...props} />
    </>
  );
}

function VariableDialog(props: RichTextEditorDialogsProps) {
  if (!props.story || !shouldShowVariableDialog(props)) {
    return null;
  }
  const editing = props.editingVariable ?? undefined;
  const target = editing ? findVariableTarget(props.story, editing) : undefined;
  return (
    <RichTextVariableDialog
      key={editing ? `variable-${editing.position}` : 'new-variable'}
      initialReference={
        editing ? variableReferenceFromEditor(props.editor, editing.position) : undefined
      }
      initialTarget={target}
      mode={editing ? 'edit' : 'create'}
      story={props.story}
      onCancel={props.onCancelVariable}
      onConfirm={props.onConfirmVariable}
    />
  );
}

function InteractionLinkDialog(props: RichTextEditorDialogsProps) {
  if (!shouldShowLinkDialog(props)) {
    return null;
  }
  const editing = props.editingLink && props.editingLink !== null ? props.editingLink : undefined;
  const initialValue =
    editing?.value ??
    (props.linkSelectionText ? { targetId: '', text: props.linkSelectionText } : undefined);
  return (
    <RichTextInteractionLinkDialog
      key={editing ? `link-${editing.position}` : 'new-interaction-link'}
      initialValue={initialValue}
      mode={editing ? 'edit' : 'create'}
      targets={props.interactionLinkTargets}
      onCancel={props.onCancelLink}
      onConfirm={props.onConfirmLink}
    />
  );
}

function ConditionalDialog(props: RichTextEditorDialogsProps) {
  if (!props.story || !props.interactionId || !props.conditionalEdit) {
    return null;
  }
  const edit = props.conditionalEdit;
  return (
    <RichTextConditionDialog
      key={`${edit.kind}:${edit.kind === 'new' ? edit.id : edit.blockId}`}
      currentInteractionId={props.interactionId}
      initialCondition={props.currentCondition}
      mode={edit.kind === 'edit' ? 'edit' : 'create'}
      story={props.story}
      onCancel={props.onCancelCondition}
      onConfirm={props.onConfirmCondition}
    />
  );
}

function shouldShowVariableDialog(props: RichTextEditorDialogsProps) {
  return Boolean(props.story && props.editingVariable !== undefined);
}

function shouldShowLinkDialog(props: RichTextEditorDialogsProps) {
  return Boolean(props.editingLink || props.editingLink === null || props.linkSelectionText);
}

function findVariableTarget(story: Story, editing: NonNullable<EditingVariable>) {
  return getStatTargets(story).find(
    (target) =>
      target.assignment.id === editing.assignmentId &&
      (target.itemId ?? undefined) === editing.itemId,
  );
}
