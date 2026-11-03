import type { ConditionalTextBlock, StatTarget, Story, TriggerCondition } from '@paralleax/shared';
import type { TFunction } from 'i18next';
import type { RichTextInteractionLinkValue } from '../../components/RichTextInteractionLinkDialog';

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  onBlur: (html: string) => void;
  autoFocus?: boolean;
  revealToolbarOnFocus?: boolean;
  ariaLabel?: string;
  story?: Story;
  interactionLinkTargets?: { id: string; title: string }[];
  interactionId?: string;
  conditionalTextBlocks?: ConditionalTextBlock[];
  onConditionalTextChange?: (html: string, blocks: ConditionalTextBlock[]) => void;
  onConditionalTargetClick?: (interactionId: string) => void;
  maxLength?: number;
};

export type EditingVariable = { position: number; assignmentId: string; itemId?: string } | null;
export type EditingLink = { position: number; value: RichTextInteractionLinkValue } | null;
export type ConditionalEdit =
  | { kind: 'new'; id: string; from: number; to: number; inline: boolean }
  | { kind: 'add'; blockId: string }
  | { kind: 'edit'; blockId: string; conditionIndex: number };

export type RichTextEditorDrafts = {
  editingVariable: EditingVariable | undefined;
  setEditingVariable: (value: EditingVariable | undefined) => void;
  editingLink: EditingLink | undefined;
  setEditingLink: (value: EditingLink | undefined) => void;
  linkSelectionText: string;
  setLinkSelectionText: (value: string) => void;
  conditionalEdit: ConditionalEdit | undefined;
  setConditionalEdit: (value: ConditionalEdit | undefined) => void;
};

export type RichTextEditorCommands = {
  openConditionalFrame: () => void;
  confirmCondition: (condition: TriggerCondition) => void;
  addVariable: (target: StatTarget, reference: string) => void;
  addInteractionLink: (link: RichTextInteractionLinkValue) => void;
  insertImage: () => void;
  insertVideo: () => void;
  openLinkDialog: () => void;
};

export type RichTextExtensionContext = {
  t: TFunction;
  story?: Story;
  interactionLinkTargets: { id: string; title: string }[];
  conditionalTextBlocks: ConditionalTextBlock[];
  onEditVariable: (position: number, assignmentId: string, itemId?: string) => void;
  onEditInteractionLink: (position: number, text: string, targetId: string) => void;
  onAddConditionalCondition: (blockId: string) => void;
  onEditConditionalCondition: (blockId: string, conditionIndex: number) => void;
  onRemoveConditionalCondition: (blockId: string, conditionIndex: number) => void;
};

export type RichTextExtensionContextStore = { current: RichTextExtensionContext };
