import { useEffect, useRef } from 'react';

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

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  ariaLabel = 'Content',
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur: (html: string) => void;
  ariaLabel?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && document.activeElement !== editor && editor.innerHTML !== value) {
      editor.innerHTML = value;
    }
  }, [value]);

  function command(name: string, commandValue?: string) {
    editorRef.current?.focus();
    document.execCommand(name, false, commandValue);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
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
      </div>
      <div
        ref={editorRef}
        className="rich-text-surface"
        contentEditable
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        suppressContentEditableWarning
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onBlur={(event) => onBlur(event.currentTarget.innerHTML)}
      />
    </div>
  );
}
