import type { ConditionalTextBlock, StatTarget, Story, TriggerCondition } from '@paralleax/shared';
import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { TFunction } from 'i18next';
import type { RichTextInteractionLinkValue } from '../../components/RichTextInteractionLinkDialog';
import type { RichTextEditorDrafts, RichTextEditorProps } from './richTextEditorTypes';

type LatestProps = { current: RichTextEditorProps };
type ConditionalNode = { id: string; conditions: TriggerCondition[] };
type ConditionalCommandOptions = {
  editor: Editor | null;
  story: Story | undefined;
  interactionId: string | undefined;
  drafts: RichTextEditorDrafts;
  t: TFunction;
};

export function publishVisualUpdate(
  editor: Editor,
  previousDoc: ProseMirrorNode,
  latestProps: LatestProps,
) {
  const props = latestProps.current;
  const previousIds = collectConditionalNodes(previousDoc).map(({ id }) => id);
  const nodes = collectConditionalNodes(editor.state.doc);
  const nextBlocks = reconcileConditionalBlocks(
    props.conditionalTextBlocks ?? [],
    previousIds,
    nodes,
  );
  const html = editor.getHTML();
  if (
    props.onConditionalTextChange &&
    hasConditionalBlockChanges(props.conditionalTextBlocks ?? [], nodes)
  ) {
    props.onConditionalTextChange(html, nextBlocks);
  } else {
    props.onChange(html);
  }
}

function reconcileConditionalBlocks(
  current: ConditionalTextBlock[],
  previousIds: string[],
  nodes: ConditionalNode[],
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const next = current
    .filter(({ id }) => !previousIds.includes(id) || byId.has(id))
    .map((block) => ({ ...block, conditions: byId.get(block.id)?.conditions ?? block.conditions }));
  for (const node of nodes) {
    if (!next.some(({ id }) => id === node.id) && node.conditions.length > 0) {
      next.push(node);
    }
  }
  return next;
}

function hasConditionalBlockChanges(current: ConditionalTextBlock[], nodes: ConditionalNode[]) {
  return current.length > 0 || nodes.length > 0;
}

export function createConditionalCommands({
  editor,
  story,
  interactionId,
  drafts,
  t,
}: ConditionalCommandOptions) {
  return {
    openConditionalFrame: () => openConditionalFrame(editor, story, interactionId, drafts),
    confirmCondition: (condition: TriggerCondition) =>
      confirmCondition({
        editor,
        edit: drafts.conditionalEdit,
        setEdit: drafts.setConditionalEdit,
        condition,
        t,
      }),
    removeConditionalCondition: (blockId: string, index: number) =>
      removeConditionalCondition(editor, blockId, index),
  };
}

function openConditionalFrame(
  editor: Editor | null,
  story: Story | undefined,
  interactionId: string | undefined,
  drafts: RichTextEditorDrafts,
) {
  if (!editor || !story || !interactionId) {
    return;
  }
  const selection = editor.state.selection;
  drafts.setConditionalEdit({
    kind: 'new',
    id: crypto.randomUUID(),
    from: selection.from,
    to: selection.to,
    inline: selection.$from.sameParent(selection.$to) && selection.$from.parent.inlineContent,
  });
}

function confirmCondition({
  editor,
  edit,
  setEdit,
  condition,
  t,
}: {
  editor: Editor | null;
  edit: RichTextEditorDrafts['conditionalEdit'];
  setEdit: RichTextEditorDrafts['setConditionalEdit'];
  condition: TriggerCondition;
  t: TFunction;
}) {
  if (!editor || !edit) {
    return;
  }
  if (edit.kind === 'new') {
    createNewConditionalFrame(editor, edit, condition, t);
  } else {
    updateConditionalFrame(editor, edit, condition);
  }
  setEdit(undefined);
}

function createNewConditionalFrame(
  editor: Editor,
  edit: Extract<NonNullable<RichTextEditorDrafts['conditionalEdit']>, { kind: 'new' }>,
  condition: TriggerCondition,
  t: TFunction,
) {
  const attributes = { blockId: edit.id, conditions: [condition] };
  if (edit.inline) {
    const selected = editor.state.doc.slice(edit.from, edit.to).content;
    const content =
      selected.size > 0 ? selected : editor.schema.text(t('richText.conditionalTextPlaceholder'));
    const node = editor.schema.nodes.conditionalTextInline.create(attributes, content);
    editor.view.dispatch(editor.state.tr.replaceWith(edit.from, edit.to, node));
    return;
  }
  editor
    .chain()
    .focus()
    .setTextSelection({ from: edit.from, to: edit.to })
    .wrapIn(editor.schema.nodes.conditionalTextBlock, attributes)
    .run();
}

function updateConditionalFrame(
  editor: Editor,
  edit: Exclude<NonNullable<RichTextEditorDrafts['conditionalEdit']>, { kind: 'new' }>,
  condition: TriggerCondition,
) {
  const frame = findConditionalNode(editor, edit.blockId);
  if (!frame) {
    return;
  }
  const conditions = readTriggerConditions(frame.node);
  const next =
    edit.kind === 'edit'
      ? conditions.map((item, index) => (index === edit.conditionIndex ? condition : item))
      : [...conditions, condition];
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(frame.position, frame.node.type, {
      ...frame.node.attrs,
      conditions: next,
    }),
  );
}

export function removeConditionalCondition(
  editor: Editor | null,
  blockId: string,
  conditionIndex: number,
) {
  if (!editor) {
    return;
  }
  const frame = findConditionalNode(editor, blockId);
  if (!frame) {
    return;
  }
  const conditions = readTriggerConditions(frame.node).filter(
    (_, index) => index !== conditionIndex,
  );
  const transaction =
    conditions.length === 0
      ? editor.state.tr.replaceWith(
          frame.position,
          frame.position + frame.node.nodeSize,
          frame.node.content,
        )
      : editor.state.tr.setNodeMarkup(frame.position, frame.node.type, {
          ...frame.node.attrs,
          conditions,
        });
  editor.view.dispatch(transaction);
}

export function createNarrativeTokenCommands(editor: Editor | null, drafts: RichTextEditorDrafts) {
  return {
    addVariable: (target: StatTarget, reference: string) =>
      addVariable(editor, drafts, target, reference),
    addInteractionLink: (link: RichTextInteractionLinkValue) =>
      addInteractionLink(editor, drafts, link),
    openLinkDialog: () => openLinkDialog(editor, drafts),
  };
}

function addVariable(
  editor: Editor | null,
  drafts: RichTextEditorDrafts,
  target: StatTarget,
  reference: string,
) {
  if (!editor) {
    return;
  }
  const node = editor.schema.nodes.statValue.create({
    assignmentId: target.assignment.id,
    itemId: target.itemId ?? null,
    sourceText: `{{${reference}}}`,
  });
  replaceOrInsertNode(editor, drafts.editingVariable?.position, node);
  drafts.setEditingVariable(undefined);
}

function addInteractionLink(
  editor: Editor | null,
  drafts: RichTextEditorDrafts,
  link: RichTextInteractionLinkValue,
) {
  if (!editor) {
    return;
  }
  const node = editor.schema.nodes.interactionLink.create({
    targetId: link.targetId,
    text: link.text,
  });
  replaceOrInsertNode(editor, drafts.editingLink?.position, node);
  drafts.setEditingLink(undefined);
  drafts.setLinkSelectionText('');
}

function openLinkDialog(editor: Editor | null, drafts: RichTextEditorDrafts) {
  if (!editor) {
    return;
  }
  drafts.setEditingVariable(undefined);
  const selection = editor.state.selection;
  const text = selection.empty
    ? ''
    : selection.content().content.textBetween(0, selection.content().size);
  drafts.setLinkSelectionText(text);
  drafts.setEditingLink(null);
}

export function createMediaCommands(editor: Editor | null, t: TFunction) {
  return {
    insertImage: () => insertImage(editor, t),
    insertVideo: () => insertVideo(editor, t),
  };
}

function insertImage(editor: Editor | null, t: TFunction) {
  if (!editor) {
    return;
  }
  const url = window.prompt(t('richText.imagePrompt'))?.trim();
  if (url && isHttpUrl(url)) {
    editor.chain().focus().setImage({ src: url }).run();
  }
}

function insertVideo(editor: Editor | null, t: TFunction) {
  if (!editor) {
    return;
  }
  const url = window.prompt(t('richText.videoPrompt'))?.trim();
  if (!url) {
    return;
  }
  const embed = videoEmbed(url, t('richText.youtubeVideo'), t('richText.vimeoVideo'));
  if (embed) {
    editor.chain().focus().insertContent(embed).run();
  }
}

function collectConditionalNodes(doc: ProseMirrorNode): ConditionalNode[] {
  const nodes: ConditionalNode[] = [];
  doc.descendants((node) => {
    if (!isConditionalNode(node)) {
      return;
    }
    const id = stringAttribute(node, 'blockId');
    if (id) {
      nodes.push({ id, conditions: readTriggerConditions(node) });
    }
  });
  return nodes;
}

function findConditionalNode(editor: Editor, id: string) {
  let found: { position: number; node: ProseMirrorNode } | undefined;
  editor.state.doc.descendants((node, position) => {
    if (isConditionalNode(node) && stringAttribute(node, 'blockId') === id) {
      found = { position, node };
      return false;
    }
  });
  return found;
}

function isConditionalNode(node: ProseMirrorNode) {
  return node.type.name === 'conditionalTextBlock' || node.type.name === 'conditionalTextInline';
}

export function readTriggerConditions(node: ProseMirrorNode): TriggerCondition[] {
  const value: unknown = node.attrs.conditions;
  return Array.isArray(value) ? value.filter(isTriggerCondition) : [];
}

function isTriggerCondition(value: unknown): value is TriggerCondition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (
    'interactionId' in value ||
    'locationId' in value ||
    'characterId' in value ||
    'statId' in value ||
    'itemDefinitionId' in value ||
    'year' in value
  );
}

function stringAttribute(node: ProseMirrorNode, name: string) {
  const value: unknown = node.attrs[name];
  return typeof value === 'string' ? value : undefined;
}

function replaceOrInsertNode(editor: Editor, position: number | undefined, node: ProseMirrorNode) {
  if (position === undefined) {
    editor.view.dispatch(editor.state.tr.replaceSelectionWith(node));
    return;
  }
  const current = editor.state.doc.nodeAt(position);
  if (current) {
    editor.view.dispatch(editor.state.tr.replaceWith(position, position + current.nodeSize, node));
  }
}

export function variableReferenceFromEditor(
  editor: Editor | null,
  position: number,
): string | undefined {
  const node = editor?.state.doc.nodeAt(position);
  const sourceText = node ? (stringAttribute(node, 'sourceText') ?? '') : '';
  return sourceText.startsWith('{{') && sourceText.endsWith('}}')
    ? sourceText.slice(2, -2)
    : undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function videoEmbed(
  url: string,
  youtubeTitle: string,
  vimeoTitle: string,
): JSONContent | undefined {
  const parsed = parseVideoUrl(url);
  if (!parsed) {
    return undefined;
  }
  return (
    youtubeEmbed(parsed, youtubeTitle) ?? vimeoEmbed(parsed, vimeoTitle) ?? directVideo(parsed)
  );
}

function parseVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

function youtubeEmbed(url: URL, title: string): JSONContent | undefined {
  const videoId =
    url.hostname === 'youtu.be'
      ? url.pathname.slice(1)
      : ['youtube.com', 'www.youtube.com'].includes(url.hostname)
        ? (url.searchParams.get('v') ?? '')
        : '';
  if (!/^[\w-]+$/.test(videoId)) {
    return undefined;
  }
  return {
    type: 'richTextIframe',
    attrs: {
      src: `https://www.youtube-nocookie.com/embed/${videoId}`,
      title,
      allow: 'accelerometer; autoplay; encrypted-media; picture-in-picture',
      allowfullscreen: true,
    },
  };
}

function vimeoEmbed(url: URL, title: string): JSONContent | undefined {
  if (!['vimeo.com', 'www.vimeo.com'].includes(url.hostname)) {
    return undefined;
  }
  const videoId = url.pathname.split('/').filter(Boolean).at(-1) ?? '';
  if (!/^\d+$/.test(videoId)) {
    return undefined;
  }
  return {
    type: 'richTextIframe',
    attrs: { src: `https://player.vimeo.com/video/${videoId}`, title },
  };
}

function directVideo(url: URL): JSONContent {
  return { type: 'richTextVideo', attrs: { src: url.toString() } };
}
