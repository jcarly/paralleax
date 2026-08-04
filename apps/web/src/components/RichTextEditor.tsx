import { useEffect, useRef, useState } from 'react';
import { MAX_INTERACTION_BODY_LENGTH } from '@paralleax/shared';
import type { ConditionalTextState } from './RichTextContent';

function embedMarkup(url: string): string | undefined {
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
    return `<iframe src="https://www.youtube-nocookie.com/embed/${youtubeId}" title="YouTube video" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  }
  if (['vimeo.com', 'www.vimeo.com'].includes(parsed.hostname)) {
    const vimeoId = parsed.pathname.split('/').filter(Boolean).at(-1);
    if (vimeoId && /^\d+$/.test(vimeoId)) {
      return `<iframe src="https://player.vimeo.com/video/${vimeoId}" title="Vimeo video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    }
  }
  return `<video src="${url.replaceAll('"', '&quot;')}" controls></video>`;
}

function characterCount(value: number) {
  return `${value.toLocaleString('en-US')} ${value === 1 ? 'character' : 'characters'}`;
}

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  ariaLabel = 'Content',
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
  const editorRef = useRef<HTMLDivElement>(null);
  const [showConditionalTargets, setShowConditionalTargets] = useState(false);
  const remainingCharacters = maxLength - value.length;
  const isNearLimit = remainingCharacters <= Math.ceil(maxLength * 0.1);
  const limitMessage =
    remainingCharacters < 0
      ? `${characterCount(Math.abs(remainingCharacters))} over limit. This content cannot be saved.`
      : isNearLimit
        ? `${characterCount(remainingCharacters)} remaining.`
        : `${value.length.toLocaleString('en-US')} / ${maxLength.toLocaleString('en-US')} characters`;

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
      if (state && !state.available) frame.title = state.reason ?? 'Unavailable';
      else frame.removeAttribute('title');
    });
  }, [conditionalTextState, value]);

  function command(name: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(name, false, commandValue);
    if (editorRef.current) onChange(editorHtml());
  }

  function insertImage() {
    const url = window.prompt('Image or GIF URL');
    if (url && /^https?:\/\//i.test(url)) command('insertImage', url);
  }

  function insertVideo() {
    const url = window.prompt('Video, YouTube, or Vimeo URL');
    const markup = url ? embedMarkup(url) : undefined;
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
    command(
      'insertHTML',
      `<div data-conditional-text-target="${escapedId}"><button type="button" contenteditable="false" aria-label="Open target interaction: ${escapedTitle}" data-conditional-text-link="${escapedId}">↗ ${escapedTitle}</button><p>Conditional text</p></div><p><br></p>`,
    );
    setShowConditionalTargets(false);
  }

  return (
    <div className="rich-text-editor">
      <div className="rich-text-toolbar" role="toolbar" aria-label="Content formatting">
        <button
          type="button"
          aria-label="Bold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('bold')}
        >
          B
        </button>
        <button
          type="button"
          aria-label="Italic"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('italic')}
        >
          I
        </button>
        <button
          type="button"
          aria-label="Underline"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('underline')}
        >
          U
        </button>
        <button
          type="button"
          aria-label="Heading"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('formatBlock', 'h2')}
        >
          H
        </button>
        <button
          type="button"
          aria-label="Bulleted list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command('insertUnorderedList')}
        >
          List
        </button>
        <button
          type="button"
          aria-label="Add image or GIF"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertImage}
        >
          Image/GIF
        </button>
        <button
          type="button"
          aria-label="Add video"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertVideo}
        >
          Video
        </button>
        <button
          type="button"
          aria-label="Add conditional text"
          title="Add conditional text"
          disabled={conditionalTargets.length === 0}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setShowConditionalTargets((visible) => !visible)}
        >
          🔗
        </button>
        {showConditionalTargets ? (
          <label className="conditional-target-picker">
            Target interaction
            <select
              aria-label="Conditional text target"
              defaultValue=""
              onChange={(event) => insertConditionalText(event.target.value)}
            >
              <option value="" disabled>
                Choose an outgoing interaction
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
        contentEditable
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        suppressContentEditableWarning
        onClick={(event) => {
          const button = (event.target as HTMLElement).closest<HTMLElement>(
            '[data-conditional-text-link]',
          );
          const targetId = button?.dataset.conditionalTextLink;
          if (targetId) {
            event.preventDefault();
            onConditionalTargetClick?.(targetId);
          }
        }}
        onInput={() => onChange(editorHtml())}
        onBlur={() => onBlur(editorHtml())}
      />
      <p
        className={`rich-text-limit ${remainingCharacters < 0 ? 'error' : isNearLimit ? 'warning' : ''}`}
        role="status"
        aria-label="Content length"
        aria-live="polite"
      >
        {limitMessage}
      </p>
    </div>
  );
}
