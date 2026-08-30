import DOMPurify from 'dompurify';

export function sanitizeRichTextForDisplay(value: string): string {
  const sanitized = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'h2',
      'h3',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'video',
      'source',
      'iframe',
      'div',
      'button',
      'span',
    ],
    ALLOWED_ATTR: [
      'href',
      'target',
      'rel',
      'src',
      'alt',
      'controls',
      'poster',
      'type',
      'title',
      'allow',
      'allowfullscreen',
      'type',
      'contenteditable',
      'aria-label',
      'data-conditional-text-target',
      'data-conditional-text-block',
      'data-conditional-text-link',
      'data-interaction-link-target',
      'data-stat-value',
      'data-stat-item',
    ],
    ALLOWED_URI_REGEXP: /^https?:\/\//i,
  });
  const template = document.createElement('template');
  template.innerHTML = sanitized;
  const allowedIframeHosts = new Set([
    'www.youtube.com',
    'youtube.com',
    'www.youtube-nocookie.com',
    'player.vimeo.com',
  ]);
  template.content.querySelectorAll('iframe').forEach((iframe) => {
    try {
      if (!allowedIframeHosts.has(new URL(iframe.src).hostname)) iframe.remove();
    } catch {
      iframe.remove();
    }
  });
  return template.innerHTML;
}
