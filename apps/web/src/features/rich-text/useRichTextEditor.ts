import {
  getStatTargets,
  hasStatTargets,
  MAX_INTERACTION_BODY_LENGTH,
  type ConditionalTextBlock,
} from '@paralleax/shared';
import { useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { statTargetPathLabel } from '../../storyStats';
import { createRichTextExtensions } from './richTextExtensions';
import {
  createConditionalCommands,
  createMediaCommands,
  createNarrativeTokenCommands,
  publishVisualUpdate,
  removeConditionalCondition,
} from './richTextEditorCommands';
import type { RichTextEditorProps, RichTextExtensionContextStore } from './richTextEditorTypes';
import type { RichTextExtensionContext } from './richTextEditorTypes';
import { validateRichTextSource } from './richTextSource';
import { useRichTextEditorDrafts } from './useRichTextEditorDrafts';

const EMPTY_BLOCKS: ConditionalTextBlock[] = [];

export function useRichTextEditor(props: RichTextEditorProps) {
  const core = useRichTextEditorCore(props);
  const commands = useEditorCommands(core.editor, props, core.drafts, core.t);
  const metrics = useEditorMetrics({
    editor: core.editor,
    value: props.value,
    maxLength: props.maxLength ?? MAX_INTERACTION_BODY_LENGTH,
    t: core.t,
    language: core.language,
  });
  const clickCapture = useLegacyConditionalClick(
    core.editor,
    core.latestPropsRef,
    core.lastBlurHtmlRef,
  );
  return assembleEditorModel({ core, commands, metrics, clickCapture, props });
}

type EditorCore = ReturnType<typeof useRichTextEditorCore>;
type EditorCommands = ReturnType<typeof useEditorCommands>;
type EditorMetrics = ReturnType<typeof useEditorMetrics>;
type ClickCapture = ReturnType<typeof useLegacyConditionalClick>;

function assembleEditorModel({
  core,
  commands,
  metrics,
  clickCapture,
  props,
}: {
  core: EditorCore;
  commands: EditorCommands;
  metrics: EditorMetrics;
  clickCapture: ClickCapture;
  props: RichTextEditorProps;
}) {
  return {
    ...core.drafts,
    ...commands,
    ...metrics,
    openVariableDialog: () => {
      core.drafts.setEditingLink(undefined);
      core.drafts.setEditingVariable(null);
    },
    cancelLinkDialog: () => {
      core.drafts.setLinkSelectionText('');
      core.drafts.setEditingLink(undefined);
    },
    editor: core.editor,
    compatibilityError: core.compatibilityError,
    hasVariables: Boolean(props.story && hasStatTargets(props.story)),
    clickCapture,
    props,
  };
}

function useRichTextEditorCore(props: RichTextEditorProps) {
  const { t, i18n } = useTranslation();
  const drafts = useRichTextEditorDrafts(props.conditionalTextBlocks ?? EMPTY_BLOCKS);
  const latestPropsRef = useRef(props);
  const lastBlurHtmlRef = useRef<string | undefined>(undefined);
  const editorReference = useRef<Editor | null>(null);
  const context = useRichTextExtensionContext(props, drafts, t, editorReference);
  const contextStoreRef = useExtensionContextStore(context);
  const extensions = useMemo(() => createRichTextExtensions(contextStoreRef), [contextStoreRef]);
  useLatestEditorProps(latestPropsRef, props);
  useUpdateExtensionContext(contextStoreRef, context);
  const nodeViewContextKey = useNodeViewContextKey(
    props,
    t,
    i18n.resolvedLanguage ?? i18n.language,
  );
  const validation = useSourceValidation(props, extensions, props.value);
  const compatibilityError = validation.ok
    ? undefined
    : firstDiagnostic(validation.diagnostics, t('richText.incompatibleContent'));
  const editor = useRichTextEngine({
    props,
    extensions,
    latestPropsRef,
    compatibilityError,
    lastBlurHtmlRef,
    t,
  });
  useLayoutEffect(() => {
    editorReference.current = editor;
  }, [editor]);

  useSyncCanonicalContent(editor, props.value, validation, compatibilityError);
  useRefreshNodeViews(editor, props.conditionalTextBlocks ?? EMPTY_BLOCKS, nodeViewContextKey);
  return {
    t,
    language: i18n.resolvedLanguage ?? i18n.language,
    drafts,
    editor,
    compatibilityError,
    latestPropsRef,
    lastBlurHtmlRef,
  };
}

function useRichTextExtensionContext(
  props: RichTextEditorProps,
  drafts: ReturnType<typeof useRichTextEditorDrafts>,
  t: ReturnType<typeof useTranslation>['t'],
  editorReference: { current: Editor | null },
): RichTextExtensionContext {
  return useMemo(
    () => ({
      t,
      story: props.story,
      interactionLinkTargets: props.interactionLinkTargets ?? [],
      conditionalTextBlocks: props.conditionalTextBlocks ?? EMPTY_BLOCKS,
      onEditVariable: (position: number, assignmentId: string, itemId?: string) =>
        drafts.setEditingVariable({ position, assignmentId, itemId }),
      onEditInteractionLink: (position: number, text: string, targetId: string) =>
        drafts.setEditingLink({ position, value: { text, targetId } }),
      onAddConditionalCondition: (blockId: string) =>
        drafts.setConditionalEdit({ kind: 'add', blockId }),
      onEditConditionalCondition: (blockId: string, conditionIndex: number) =>
        drafts.setConditionalEdit({ kind: 'edit', blockId, conditionIndex }),
      onRemoveConditionalCondition: (blockId: string, conditionIndex: number) =>
        removeConditionalCondition(editorReference.current, blockId, conditionIndex),
    }),
    [
      drafts,
      editorReference,
      props.conditionalTextBlocks,
      props.interactionLinkTargets,
      props.story,
      t,
    ],
  );
}

function useExtensionContextStore(context: ReturnType<typeof useRichTextExtensionContext>) {
  const [contextStoreRef] = useState<RichTextExtensionContextStore>(() => ({ current: context }));
  return contextStoreRef;
}

function useLatestEditorProps(
  latestPropsRef: { current: RichTextEditorProps },
  props: RichTextEditorProps,
) {
  useLayoutEffect(() => {
    latestPropsRef.current = props;
  }, [latestPropsRef, props]);
}

function useUpdateExtensionContext(
  contextStoreRef: RichTextExtensionContextStore,
  context: ReturnType<typeof useRichTextExtensionContext>,
) {
  useLayoutEffect(() => {
    contextStoreRef.current = context;
  }, [context, contextStoreRef]);
}

function useNodeViewContextKey(
  props: RichTextEditorProps,
  t: ReturnType<typeof useTranslation>['t'],
  language: string,
) {
  return useMemo(
    () =>
      JSON.stringify({
        interactionLinkTargets: props.interactionLinkTargets,
        conditionalTextBlocks: props.conditionalTextBlocks,
        variables: props.story
          ? getStatTargets(props.story).map((target) => [
              target.assignment.id,
              target.itemId ?? null,
              statTargetPathLabel(target, t('attributes.owner.story')),
            ])
          : [],
        language,
      }),
    [language, props.conditionalTextBlocks, props.interactionLinkTargets, props.story, t],
  );
}

function useSourceValidation(
  props: RichTextEditorProps,
  extensions: ReturnType<typeof createRichTextExtensions>,
  source: string,
) {
  return useMemo(
    () =>
      validateRichTextSource({
        source,
        extensions,
        story: props.story,
        conditionalTextBlocks: props.conditionalTextBlocks ?? EMPTY_BLOCKS,
        baselineHtml: source,
      }),
    [extensions, props.conditionalTextBlocks, props.story, source],
  );
}

function useRichTextEngine({
  props,
  extensions,
  latestPropsRef,
  compatibilityError,
  lastBlurHtmlRef,
  t,
}: {
  props: RichTextEditorProps;
  extensions: ReturnType<typeof createRichTextExtensions>;
  latestPropsRef: { current: RichTextEditorProps };
  compatibilityError: string | undefined;
  lastBlurHtmlRef: { current: string | undefined };
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return useEditor({
    extensions,
    content: props.value,
    autofocus: props.autoFocus ? 'end' : false,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        'aria-label': props.ariaLabel ?? t('richText.content'),
        'data-comment-field': 'body',
      },
    },
    onCreate: ({ editor }) => editor.setEditable(!compatibilityError, false),
    onUpdate: ({ editor, transaction }) => {
      if (
        !compatibilityError &&
        !transaction.getMeta('richTextExternalBlocks') &&
        transaction.getMeta('addToHistory') !== false &&
        !transaction.getMeta('preventUpdate')
      ) {
        publishVisualUpdate(editor, transaction.before, latestPropsRef);
      }
    },
    onBlur: ({ editor }) => publishBlur(editor, latestPropsRef, lastBlurHtmlRef),
  });
}

function useSyncCanonicalContent(
  editor: Editor | null,
  value: string,
  validation: ReturnType<typeof validateRichTextSource>,
  compatibilityError: string | undefined,
) {
  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(!compatibilityError, false);
    if (!validation.ok || editor.view.dom.contains(document.activeElement)) {
      return;
    }
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [compatibilityError, editor, validation, value]);
}

function useRefreshNodeViews(editor: Editor | null, blocks: ConditionalTextBlock[], key: string) {
  const revisionRef = useRef(0);
  const previousKeyRef = useRef(key);
  useEffect(() => {
    if (!editor || previousKeyRef.current === key) {
      return;
    }
    previousKeyRef.current = key;
    const version = revisionRef.current + 1;
    revisionRef.current = version;
    const transaction = editor.state.tr;
    editor.state.doc.descendants((node, position) => {
      if (!('contextRevision' in node.attrs)) {
        return;
      }
      const attrs: Record<string, unknown> = { ...node.attrs, contextRevision: version };
      const blockId = stringAttribute(node, 'blockId');
      if (blockId) {
        const conditions = blocks.find((block) => block.id === blockId)?.conditions;
        if (conditions) {
          attrs.conditions = conditions;
        }
      }
      transaction.setNodeMarkup(position, node.type, attrs);
    });
    transaction.setMeta('addToHistory', false).setMeta('richTextExternalBlocks', true);
    editor.view.dispatch(transaction);
  }, [blocks, editor, key, previousKeyRef, revisionRef]);
}

function useEditorCommands(
  editor: Editor | null,
  props: RichTextEditorProps,
  drafts: ReturnType<typeof useRichTextEditorDrafts>,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const conditional = createConditionalCommands({
    editor,
    story: props.story,
    interactionId: props.interactionId,
    drafts,
    t,
  });
  return {
    ...conditional,
    ...createNarrativeTokenCommands(editor, drafts),
    ...createMediaCommands(editor, t),
  };
}

function useLegacyConditionalClick(
  editor: Editor | null,
  latestPropsRef: { current: RichTextEditorProps },
  lastBlurHtmlRef: { current: string | undefined },
) {
  return (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>('button[data-conditional-text-link]');
    if (!button) {
      return;
    }
    const html = editor?.getHTML() ?? latestPropsRef.current.value;
    publishBlurIfChanged(html, latestPropsRef, lastBlurHtmlRef);
    latestPropsRef.current.onConditionalTargetClick?.(button.dataset.conditionalTextLink ?? '');
  };
}

function publishBlurIfChanged(
  html: string,
  latestPropsRef: { current: RichTextEditorProps },
  lastBlurHtmlRef: { current: string | undefined },
) {
  if (lastBlurHtmlRef.current === html) {
    return;
  }
  lastBlurHtmlRef.current = html;
  latestPropsRef.current.onBlur(html);
}

function publishBlur(
  editor: Editor,
  latestPropsRef: { current: RichTextEditorProps },
  lastBlurHtmlRef: { current: string | undefined },
) {
  const html = editor.getHTML();
  lastBlurHtmlRef.current = html;
  latestPropsRef.current.onBlur(html);
}

function useEditorMetrics({
  editor,
  value,
  maxLength,
  t,
  language,
}: {
  editor: Editor | null;
  value: string;
  maxLength: number;
  t: ReturnType<typeof useTranslation>['t'];
  language: string;
}) {
  const html = editor?.getHTML() ?? value;
  const remaining = maxLength - html.length;
  const nearLimit = remaining <= Math.ceil(maxLength * 0.1);
  const formatter = new Intl.NumberFormat(language);
  const formatCount = (count: number) => t('richText.characters', { count });
  return {
    remainingCharacters: remaining,
    nearLimit,
    limitMessage:
      remaining < 0
        ? t('richText.overLimit', { characters: formatCount(Math.abs(remaining)) })
        : nearLimit
          ? t('richText.remaining', { characters: formatCount(remaining) })
          : t('richText.length', {
              current: formatter.format(html.length),
              maximum: formatter.format(maxLength),
            }),
  };
}

function firstDiagnostic(diagnostics: { message: string }[], fallback: string) {
  return diagnostics[0]?.message ?? fallback;
}

function stringAttribute(node: ProseMirrorNode, name: string) {
  const value: unknown = node.attrs[name];
  return typeof value === 'string' ? value : undefined;
}
