import type { ConditionalTextBlock, TriggerCondition } from '@paralleax/shared';
import { useState } from 'react';
import type { RichTextEditorDrafts } from './richTextEditorTypes';
import type { ConditionalEdit, EditingLink, EditingVariable } from './richTextEditorTypes';

const EMPTY_BLOCKS: ConditionalTextBlock[] = [];

export function useRichTextEditorDrafts(conditionalTextBlocks: ConditionalTextBlock[]) {
  const [editingVariable, setEditingVariable] = useState<EditingVariable>();
  const [editingLink, setEditingLink] = useState<EditingLink>();
  const [linkSelectionText, setLinkSelectionText] = useState('');
  const [conditionalEdit, setConditionalEdit] = useState<ConditionalEdit>();
  return {
    editingVariable,
    setEditingVariable,
    editingLink,
    setEditingLink,
    linkSelectionText,
    setLinkSelectionText,
    conditionalEdit,
    setConditionalEdit,
    currentCondition: currentConditionFor(conditionalEdit, conditionalTextBlocks ?? EMPTY_BLOCKS),
  } satisfies RichTextEditorDrafts & { currentCondition?: TriggerCondition };
}

function currentConditionFor(
  edit: ConditionalEdit | undefined,
  blocks: ConditionalTextBlock[],
): TriggerCondition | undefined {
  if (edit?.kind !== 'edit') {
    return undefined;
  }
  return blocks.find(({ id }) => id === edit.blockId)?.conditions[edit.conditionIndex];
}
