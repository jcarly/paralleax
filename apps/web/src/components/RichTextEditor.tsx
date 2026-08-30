import { useEffect, useRef, useState } from 'react';
import {
  getStatTargets,
  hasStatTargets,
  MAX_INTERACTION_BODY_LENGTH,
  type StatTarget,
  type Story,
} from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import { statTargetPathLabel } from '../storyStats';
import type { ConditionalTextState } from './RichTextContent';
import {
  RichTextInteractionLinkDialog,
  type RichTextInteractionLinkValue,
} from './RichTextInteractionLinkDialog';
import { RichTextVariableDialog } from './RichTextVariableDialog';

function escapeHtmlText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', '&quot;');
}

interface EditingVariable {
  reference: string;
  target?: StatTarget;
}

type EditingInteractionLink = RichTextInteractionLinkValue;

function getVariableMarkerSource(marker: HTMLElement): string {
  return (
    marker.querySelector<HTMLElement>('[data-rich-text-variable-edit]')?.dataset
      .richTextVariableSource ??
    marker.textContent ??
    ''
  );
}

function getVariableMarkerExpression(marker: HTMLElement): string {
  const source = getVariableMarkerSource(marker).trim();
  const match = /^\{\{([\s\S]*)\}\}$/.exec(source);
  return match?.[1] ?? source;
}

function getInteractionLinkText(marker: HTMLElement): string {
  return (
    marker.querySelector<HTMLElement>('[data-rich-text-interaction-link-edit]')?.dataset
      .richTextInteractionLinkText ??
    marker.textContent ??
    ''
  );
}

function restoreRichTextTokenMarker(
  marker: HTMLElement,
  source: string,
  selectedClassName: string,
) {
  marker.textContent = source;
  marker.classList.remove('rich-text-token-dragging', selectedClassName);
  marker.removeAttribute('draggable');
  marker.removeAttribute('aria-label');
  marker.removeAttribute('role');
  marker.removeAttribute('tabindex');
  if (marker.classList.length === 0) marker.removeAttribute('class');
}

function ensureRichTextTokenControls(
  marker: HTMLElement,
  editDataAttribute: string,
  removeDataAttribute: string,
) {
  let editButton = marker.querySelector<HTMLButtonElement>(`[${editDataAttribute}]`);
  let removeButton = marker.querySelector<HTMLButtonElement>(`[${removeDataAttribute}]`);
  if (!editButton || !removeButton) {
    marker.textContent = '';
    editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.contentEditable = 'false';
    editButton.className = 'rich-text-token-edit';
    editButton.setAttribute(editDataAttribute, '');
    removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.contentEditable = 'false';
    removeButton.className = 'trigger-link-delete rich-text-token-remove';
    removeButton.setAttribute(removeDataAttribute, '');
    removeButton.textContent = 'x';
    marker.append(editButton, removeButton);
  }
  return { editButton, removeButton };
}

function getCaretRangeFromPoint(x: number, y: number): Range | undefined {
  const caretDocument = document as Document & {
    caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null;
    caretPositionFromPoint?: (
      clientX: number,
      clientY: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const range = caretDocument.caretRangeFromPoint?.(x, y);
  if (range) return range;

  const position = caretDocument.caretPositionFromPoint?.(x, y);
  if (!position) return undefined;
  const positionRange = document.createRange();
  positionRange.setStart(position.offsetNode, position.offset);
  positionRange.collapse(true);
  return positionRange;
}

function closestRichTextToken(node: Node): HTMLElement | undefined {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return (
    element?.closest<HTMLElement>('[data-stat-value], [data-interaction-link-target]') ?? undefined
  );
}

function embedMarkup(url: string, youtubeTitle: string, vimeoTitle: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;

  const youtubeId =
    parsed.hostname === 'youtu.be'
      ? parsed.pathname.slice(1)
      : ['youtube.com', 'www.youtube.com'].includes(parsed.hostname)
        ? parsed.searchParams.get('v')
        : undefined;
  if (youtubeId && /^[\w-]+$/.test(youtubeId)) {
    return `<iframe src="https://www.youtube-nocookie.com/embed/${youtubeId}" title="${youtubeTitle}" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  }
  if (['vimeo.com', 'www.vimeo.com'].includes(parsed.hostname)) {
    const vimeoId = parsed.pathname.split('/').filter(Boolean).at(-1);
    if (vimeoId && /^\d+$/.test(vimeoId)) {
      return `<iframe src="https://player.vimeo.com/video/${vimeoId}" title="${vimeoTitle}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    }
  }
  return `<video src="${url.replaceAll('"', '&quot;')}" controls></video>`;
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  ariaLabel,
  story,
  interactionLinkTargets = [],
  conditionalTextState,
  onConditionalTargetClick,
  maxLength = MAX_INTERACTION_BODY_LENGTH,
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur: (html: string) => void;
  ariaLabel?: string;
  story?: Story;
  interactionLinkTargets?: { id: string; title: string }[];
  conditionalTextState?: ConditionalTextState;
  onConditionalTargetClick?: (interactionId: string) => void;
  maxLength?: number;
}) {
  const { t, i18n } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const editorSelectionRef = useRef<Range | undefined>(undefined);
  const editingVariableElementRef = useRef<HTMLElement | undefined>(undefined);
  const editingInteractionLinkElementRef = useRef<HTMLElement | undefined>(undefined);
  const draggedRichTextTokenRef = useRef<HTMLElement | undefined>(undefined);
  const [variableDialogOpen, setVariableDialogOpen] = useState(false);
  const [editingVariable, setEditingVariable] = useState<EditingVariable>();
  const [interactionLinkDialogOpen, setInteractionLinkDialogOpen] = useState(false);
  const [editingInteractionLink, setEditingInteractionLink] = useState<EditingInteractionLink>();
  const hasVariables = Boolean(story && hasStatTargets(story));
  const remainingCharacters = maxLength - value.length;
  const isNearLimit = remainingCharacters <= Math.ceil(maxLength * 0.1);
  const formatCount = (count: number) => t('richText.characters', { count });
  const numberFormatter = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language);
  const limitMessage =
    remainingCharacters < 0
      ? t('richText.overLimit', { characters: formatCount(Math.abs(remainingCharacters)) })
      : isNearLimit
        ? t('richText.remaining', { characters: formatCount(remainingCharacters) })
        : t('richText.length', {
            current: numberFormatter.format(value.length),
            maximum: numberFormatter.format(maxLength),
          });

  function editorHtml() {
    const clone = editorRef.current?.cloneNode(true) as HTMLDivElement | undefined;
    clone?.querySelectorAll<HTMLElement>('[data-conditional-text-target]').forEach((frame) => {
      frame.classList.remove('conditional-text', 'conditional-text-unavailable');
      frame.removeAttribute('title');
      frame.querySelector('.conditional-text-reason')?.remove();
    });
    clone?.querySelectorAll<HTMLElement>('[data-stat-value]').forEach((marker) => {
      restoreRichTextTokenMarker(
        marker,
        getVariableMarkerSource(marker),
        'rich-text-variable-selected',
      );
    });
    clone?.querySelectorAll<HTMLElement>('[data-interaction-link-target]').forEach((marker) => {
      restoreRichTextTokenMarker(
        marker,
        getInteractionLinkText(marker),
        'rich-text-interaction-link-selected',
      );
    });
    return clone?.innerHTML ?? '';
  }

  function rememberEditorSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      editorSelectionRef.current = range.cloneRange();
    }
  }

  function focusEditorAtRememberedSelection() {
    const editor = editorRef.current;
    const range = editorSelectionRef.current;
    editor?.focus();
    if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && document.activeElement !== editor && editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.querySelectorAll<HTMLElement>('[data-conditional-text-target]').forEach((frame) => {
      const state = conditionalTextState?.[frame.dataset.conditionalTextTarget ?? ''];
      frame.classList.add('conditional-text');
      frame.classList.toggle('conditional-text-unavailable', Boolean(state && !state.available));
      if (state && !state.available) frame.title = state.reason ?? t('richText.unavailable');
      else frame.removeAttribute('title');
    });
  }, [conditionalTextState, t, value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const targets = story ? getStatTargets(story) : [];
    editor.querySelectorAll<HTMLElement>('[data-stat-value]').forEach((marker) => {
      const source = getVariableMarkerSource(marker);
      const target = targets.find(
        (candidate) =>
          candidate.assignment.id === marker.dataset.statValue &&
          candidate.itemId === marker.dataset.statItem,
      );
      const fallbackExpression = getVariableMarkerExpression(marker);
      const displayLabel = target
        ? statTargetPathLabel(target, t('attributes.owner.story'))
        : fallbackExpression.replaceAll('.', ' → ') || marker.dataset.statValue || '';
      const { editButton, removeButton } = ensureRichTextTokenControls(
        marker,
        'data-rich-text-variable-edit',
        'data-rich-text-variable-remove',
      );
      editButton.dataset.richTextVariableSource = source;
      editButton.textContent = displayLabel;
      editButton.draggable = true;
      marker.classList.toggle(
        'rich-text-variable-selected',
        Boolean(editingVariable) && marker === editingVariableElementRef.current,
      );
      editButton.setAttribute(
        'aria-label',
        t('richText.editVariableToken', { reference: displayLabel }),
      );
      removeButton.setAttribute(
        'aria-label',
        t('richText.removeVariableToken', { reference: displayLabel }),
      );
      removeButton.title = t('richText.removeVariableToken', { reference: displayLabel });
    });
  }, [editingVariable, story, t, value, variableDialogOpen]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.querySelectorAll<HTMLElement>('[data-interaction-link-target]').forEach((marker) => {
      const linkText = getInteractionLinkText(marker);
      const targetId = marker.dataset.interactionLinkTarget ?? '';
      const targetTitle =
        interactionLinkTargets.find(({ id }) => id === targetId)?.title ?? targetId;
      const displayLabel = `🔗 ${linkText} | ${targetTitle}`;
      const { editButton, removeButton } = ensureRichTextTokenControls(
        marker,
        'data-rich-text-interaction-link-edit',
        'data-rich-text-interaction-link-remove',
      );
      editButton.dataset.richTextInteractionLinkText = linkText;
      editButton.textContent = displayLabel;
      editButton.draggable = true;
      marker.classList.toggle(
        'rich-text-interaction-link-selected',
        Boolean(editingInteractionLink) && marker === editingInteractionLinkElementRef.current,
      );
      editButton.setAttribute(
        'aria-label',
        t('richText.editInteractionLinkToken', { text: linkText, target: targetTitle }),
      );
      removeButton.setAttribute(
        'aria-label',
        t('richText.removeInteractionLinkToken', { text: linkText, target: targetTitle }),
      );
      removeButton.title = t('richText.removeInteractionLinkToken', {
        text: linkText,
        target: targetTitle,
      });
    });
  }, [editingInteractionLink, interactionLinkDialogOpen, interactionLinkTargets, t, value]);

  function command(name: string, commandValue?: string) {
    focusEditorAtRememberedSelection();
    document.execCommand(name, false, commandValue);
    rememberEditorSelection();
    if (editorRef.current) onChange(editorHtml());
  }

  function insertImage() {
    const url = window.prompt(t('richText.imagePrompt'));
    if (url && /^https?:\/\//i.test(url)) command('insertImage', url);
  }

  function insertVideo() {
    const url = window.prompt(t('richText.videoPrompt'));
    const markup = url
      ? embedMarkup(url, t('richText.youtubeVideo'), t('richText.vimeoVideo'))
      : undefined;
    if (markup) command('insertHTML', markup);
  }

  function commitVariable(target: StatTarget, reference: string) {
    const existingMarker = editingVariableElementRef.current;
    if (existingMarker && editorRef.current?.contains(existingMarker)) {
      existingMarker.dataset.statValue = target.assignment.id;
      if (target.itemId) existingMarker.dataset.statItem = target.itemId;
      else delete existingMarker.dataset.statItem;
      existingMarker.textContent = `{{${reference}}}`;
      editingVariableElementRef.current = undefined;
      setEditingVariable(undefined);
      setVariableDialogOpen(false);
      editorRef.current.focus();
      onChange(editorHtml());
      return;
    }
    const itemAttribute = target.itemId
      ? ` data-stat-item="${escapeHtmlAttribute(target.itemId)}"`
      : '';
    command(
      'insertHTML',
      `<span contenteditable="false" data-stat-value="${escapeHtmlAttribute(target.assignment.id)}"${itemAttribute}>{{${escapeHtmlText(reference)}}}</span>`,
    );
    editingVariableElementRef.current = undefined;
    setEditingVariable(undefined);
    setVariableDialogOpen(false);
  }

  function openVariableEditor(marker: HTMLElement) {
    const assignmentId = marker.dataset.statValue;
    if (!assignmentId) return;
    const itemId = marker.dataset.statItem;
    const target = story
      ? getStatTargets(story).find(
          (candidate) => candidate.assignment.id === assignmentId && candidate.itemId === itemId,
        )
      : undefined;
    editingInteractionLinkElementRef.current = undefined;
    setEditingInteractionLink(undefined);
    setInteractionLinkDialogOpen(false);
    editingVariableElementRef.current = marker;
    setEditingVariable({ reference: getVariableMarkerExpression(marker), target });
    setVariableDialogOpen(true);
  }

  function closeVariableDialog() {
    const marker = editingVariableElementRef.current;
    const editButton = marker?.querySelector<HTMLElement>('[data-rich-text-variable-edit]');
    editingVariableElementRef.current = undefined;
    setEditingVariable(undefined);
    setVariableDialogOpen(false);
    queueMicrotask(() => {
      if (editButton?.isConnected) editButton.focus();
      else focusEditorAtRememberedSelection();
    });
  }

  function commitInteractionLink(link: RichTextInteractionLinkValue) {
    const existingMarker = editingInteractionLinkElementRef.current;
    if (existingMarker && editorRef.current?.contains(existingMarker)) {
      existingMarker.dataset.interactionLinkTarget = link.targetId;
      existingMarker.textContent = link.text;
      editingInteractionLinkElementRef.current = undefined;
      setEditingInteractionLink(undefined);
      setInteractionLinkDialogOpen(false);
      editorRef.current.focus();
      onChange(editorHtml());
      return;
    }
    command(
      'insertHTML',
      `<span contenteditable="false" data-interaction-link-target="${escapeHtmlAttribute(link.targetId)}">${escapeHtmlText(link.text)}</span>`,
    );
    editingInteractionLinkElementRef.current = undefined;
    setEditingInteractionLink(undefined);
    setInteractionLinkDialogOpen(false);
  }

  function openInteractionLinkEditor(marker: HTMLElement) {
    const targetId = marker.dataset.interactionLinkTarget;
    if (!targetId) return;
    editingVariableElementRef.current = undefined;
    setEditingVariable(undefined);
    setVariableDialogOpen(false);
    editingInteractionLinkElementRef.current = marker;
    setEditingInteractionLink({ targetId, text: getInteractionLinkText(marker) });
    setInteractionLinkDialogOpen(true);
  }

  function closeInteractionLinkDialog() {
    const marker = editingInteractionLinkElementRef.current;
    const editButton = marker?.querySelector<HTMLElement>('[data-rich-text-interaction-link-edit]');
    editingInteractionLinkElementRef.current = undefined;
    setEditingInteractionLink(undefined);
    setInteractionLinkDialogOpen(false);
    queueMicrotask(() => {
      if (editButton?.isConnected) editButton.focus();
      else focusEditorAtRememberedSelection();
    });
  }

  function removeRichTextToken(marker?: HTMLElement | null) {
    if (!marker) return;
    const parent = marker.parentNode;
    const offset = parent ? Array.from(parent.childNodes).indexOf(marker) : -1;
    marker.remove();
    editingVariableElementRef.current = undefined;
    setEditingVariable(undefined);
    setVariableDialogOpen(false);
    editingInteractionLinkElementRef.current = undefined;
    setEditingInteractionLink(undefined);
    setInteractionLinkDialogOpen(false);
    const editor = editorRef.current;
    editor?.focus();
    if (parent && offset >= 0 && editor?.contains(parent)) {
      const range = document.createRange();
      range.setStart(parent, Math.min(offset, parent.childNodes.length));
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      rememberEditorSelection();
    }
    onChange(editorHtml());
  }

  function finishRichTextTokenDrag() {
    draggedRichTextTokenRef.current?.classList.remove('rich-text-token-dragging');
    draggedRichTextTokenRef.current = undefined;
  }

  function moveDraggedRichTextToken(clientX: number, clientY: number) {
    const editor = editorRef.current;
    const marker = draggedRichTextTokenRef.current;
    const range = getCaretRangeFromPoint(clientX, clientY);
    if (!editor || !marker || !range || !editor.contains(range.commonAncestorContainer)) {
      finishRichTextTokenDrag();
      return;
    }

    const targetMarker = closestRichTextToken(range.startContainer);
    if (targetMarker === marker) {
      finishRichTextTokenDrag();
      return;
    }
    if (targetMarker) {
      const bounds = targetMarker.getBoundingClientRect();
      range.selectNode(targetMarker);
      range.collapse(clientX < bounds.left + bounds.width / 2);
    }

    const previousHtml = editorHtml();
    const insertionPoint = document.createTextNode('');
    range.insertNode(insertionPoint);
    insertionPoint.parentNode?.insertBefore(marker, insertionPoint);
    insertionPoint.remove();
    finishRichTextTokenDrag();

    editor.focus();
    const selectionRange = document.createRange();
    selectionRange.setStartAfter(marker);
    selectionRange.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(selectionRange);
    rememberEditorSelection();

    const nextHtml = editorHtml();
    if (nextHtml !== previousHtml) onChange(nextHtml);
  }

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label={t('richText.formatting')}>
        <button
          type="button"
          aria-label={t('richText.bold')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('bold')}
        >
          B
        </button>
        <button
          type="button"
          aria-label={t('richText.italic')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('italic')}
        >
          I
        </button>
        <button
          type="button"
          aria-label={t('richText.underline')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('underline')}
        >
          U
        </button>
        <button
          type="button"
          aria-label={t('richText.heading')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('formatBlock', 'h2')}
        >
          H
        </button>
        <button
          type="button"
          aria-label={t('richText.bulletedList')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('insertUnorderedList')}
        >
          {t('richText.list')}
        </button>
        <button
          type="button"
          aria-label={t('richText.addImage')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertImage}
        >
          {t('richText.image')}
        </button>
        <button
          type="button"
          aria-label={t('richText.addVideo')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertVideo}
        >
          {t('richText.video')}
        </button>
        <button
          type="button"
          aria-label={t('richText.addInteractionLink')}
          title={t('richText.addInteractionLink')}
          disabled={interactionLinkTargets.length === 0}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            editingVariableElementRef.current = undefined;
            setEditingVariable(undefined);
            setVariableDialogOpen(false);
            editingInteractionLinkElementRef.current = undefined;
            setEditingInteractionLink(undefined);
            setInteractionLinkDialogOpen(true);
          }}
        >
          🔗
        </button>
        <button
          type="button"
          aria-label={t('richText.addVariable')}
          title={t('richText.addVariable')}
          disabled={!hasVariables}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            editingInteractionLinkElementRef.current = undefined;
            setEditingInteractionLink(undefined);
            setInteractionLinkDialogOpen(false);
            editingVariableElementRef.current = undefined;
            setEditingVariable(undefined);
            setVariableDialogOpen(true);
          }}
        >
          {'{x}'}
        </button>
      </div>
      {variableDialogOpen && story ? (
        <RichTextVariableDialog
          key={
            editingVariable?.target
              ? `edit:${editingVariable.target.itemId ?? ''}:${editingVariable.target.assignment.id}`
              : editingVariable
                ? 'edit:unknown-variable'
                : 'create-variable'
          }
          initialReference={editingVariable?.reference}
          initialTarget={editingVariable?.target}
          mode={editingVariable ? 'edit' : 'create'}
          story={story}
          onCancel={closeVariableDialog}
          onConfirm={commitVariable}
        />
      ) : null}
      {interactionLinkDialogOpen ? (
        <RichTextInteractionLinkDialog
          key={
            editingInteractionLink
              ? `edit:${editingInteractionLink.targetId}`
              : 'create-interaction-link'
          }
          initialValue={editingInteractionLink}
          mode={editingInteractionLink ? 'edit' : 'create'}
          targets={interactionLinkTargets}
          onCancel={closeInteractionLinkDialog}
          onConfirm={commitInteractionLink}
        />
      ) : null}
      <div
        ref={editorRef}
        className="rich-text-surface"
        data-comment-field="body"
        contentEditable
        role="textbox"
        aria-label={ariaLabel ?? t('richText.content')}
        aria-multiline="true"
        suppressContentEditableWarning
        onDragStart={(event) => {
          const editButton = (event.target as HTMLElement).closest<HTMLElement>(
            '[data-rich-text-variable-edit], [data-rich-text-interaction-link-edit]',
          );
          const marker = editButton?.closest<HTMLElement>(
            '[data-stat-value], [data-interaction-link-target]',
          );
          if (!editButton || !marker) return;
          draggedRichTextTokenRef.current = marker;
          marker.classList.add('rich-text-token-dragging');
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', editButton.textContent ?? '');
        }}
        onDragOver={(event) => {
          if (!draggedRichTextTokenRef.current) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(event) => {
          if (!draggedRichTextTokenRef.current) return;
          event.preventDefault();
          moveDraggedRichTextToken(event.clientX, event.clientY);
        }}
        onDragEnd={finishRichTextTokenDrag}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          const removeTokenButton = target.closest<HTMLElement>(
            '[data-rich-text-variable-remove], [data-rich-text-interaction-link-remove]',
          );
          if (removeTokenButton) {
            event.preventDefault();
            event.stopPropagation();
            removeRichTextToken(
              removeTokenButton.closest<HTMLElement>(
                '[data-stat-value], [data-interaction-link-target]',
              ),
            );
            return;
          }
          const interactionLinkEditButton = target.closest<HTMLElement>(
            '[data-rich-text-interaction-link-edit]',
          );
          const interactionLink = interactionLinkEditButton?.closest<HTMLElement>(
            '[data-interaction-link-target]',
          );
          if (interactionLink) {
            event.preventDefault();
            openInteractionLinkEditor(interactionLink);
            return;
          }
          const button = target.closest<HTMLElement>('[data-conditional-text-link]');
          const targetId = button?.dataset.conditionalTextLink;
          if (targetId) {
            event.preventDefault();
            editorRef.current?.blur();
            onConditionalTargetClick?.(targetId);
            return;
          }
          const variableEditButton = target.closest<HTMLElement>('[data-rich-text-variable-edit]');
          const variable = variableEditButton?.closest<HTMLElement>('[data-stat-value]');
          if (variable) {
            event.preventDefault();
            openVariableEditor(variable);
          }
        }}
        onFocus={rememberEditorSelection}
        onInput={() => {
          rememberEditorSelection();
          onChange(editorHtml());
        }}
        onKeyUp={rememberEditorSelection}
        onMouseUp={rememberEditorSelection}
        onBlur={() => {
          rememberEditorSelection();
          onBlur(editorHtml());
        }}
      />
      <p
        className={`rich-text-limit ${remainingCharacters < 0 ? 'error' : isNearLimit ? 'warning' : ''}`}
        role="status"
        aria-label={t('richText.contentLength')}
        aria-live="polite"
      >
        {limitMessage}
      </p>
    </div>
  );
}
