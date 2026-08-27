import { useEffect, useRef, useState } from 'react';
import { MAX_INTERACTION_BODY_LENGTH } from '@paralleax/shared';
import { useTranslation } from 'react-i18next';
import type { ConditionalTextState } from './RichTextContent';

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
  conditionalTargets = [],
  conditionalTextState,
  onConditionalTargetClick,
  maxLength = MAX_INTERACTION_BODY_LENGTH,
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur: (html: string) => void;
  ariaLabel?: string;
  conditionalTargets?: { id: string; title: string }[];
  conditionalTextState?: ConditionalTextState;
  onConditionalTargetClick?: (interactionId: string) => void;
  maxLength?: number;
}) {
  const { t, i18n } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const [showConditionalTargets, setShowConditionalTargets] = useState(false);
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
    return clone?.innerHTML ?? '';
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

  function command(name: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(name, false, commandValue);
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

  function insertConditionalText(targetId: string) {
    const target = conditionalTargets.find(({ id }) => id === targetId);
    if (!target) return;
    const escapedId = target.id.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    const escapedTitle = target.title
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const escapedAriaLabel = t('richText.openTarget', { title: target.title })
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const escapedPlaceholder = t('richText.conditionalTextPlaceholder')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    command(
      'insertHTML',
      `<div data-conditional-text-target="${escapedId}"><button type="button" contenteditable="false" aria-label="${escapedAriaLabel}" data-conditional-text-link="${escapedId}">↗ ${escapedTitle}</button><p>${escapedPlaceholder}</p></div><p><br></p>`,
    );
    setShowConditionalTargets(false);
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
          aria-label={t('richText.addConditionalText')}
          title={t('richText.addConditionalText')}
          disabled={conditionalTargets.length === 0}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setShowConditionalTargets((visible) => !visible)}
        >
          🔗
        </button>
        {showConditionalTargets ? (
          <label className="conditional-target-picker">
            {t('richText.targetInteraction')}
            <select
              aria-label={t('richText.conditionalTarget')}
              defaultValue=""
              onChange={(event) => insertConditionalText(event.target.value)}
            >
              <option value="" disabled>
                {t('richText.chooseOutgoing')}
              </option>
              {conditionalTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div
        ref={editorRef}
        className="rich-text-surface"
        data-comment-field="body"
        contentEditable
        role="textbox"
        aria-label={ariaLabel ?? t('richText.content')}
        aria-multiline="true"
        suppressContentEditableWarning
        onClick={(event) => {
          const button = (event.target as HTMLElement).closest<HTMLElement>(
            '[data-conditional-text-link]',
          );
          const targetId = button?.dataset.conditionalTextLink;
          if (targetId) {
            event.preventDefault();
            editorRef.current?.blur();
            onConditionalTargetClick?.(targetId);
          }
        }}
        onInput={() => onChange(editorHtml())}
        onBlur={() => onBlur(editorHtml())}
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
