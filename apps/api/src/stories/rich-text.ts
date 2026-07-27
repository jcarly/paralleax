// sanitize-html exposes a CommonJS `export =` entry point in the NestJS runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sanitizeHtml = require('sanitize-html');

export function sanitizeRichText(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [
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
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      video: ['src', 'controls', 'poster'],
      source: ['src', 'type'],
      iframe: ['src', 'title', 'allow', 'allowfullscreen'],
      div: ['data-conditional-text-target'],
      button: ['type', 'contenteditable', 'aria-label', 'data-conditional-text-link'],
    },
    allowedSchemes: ['http', 'https'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
      video: ['http', 'https'],
      source: ['http', 'https'],
      iframe: ['https'],
    },
    allowedIframeHostnames: [
      'www.youtube.com',
      'youtube.com',
      'www.youtube-nocookie.com',
      'player.vimeo.com',
    ],
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: 'a',
        attribs: {
          ...attributes,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      video: (_tagName, attributes) => ({
        tagName: 'video',
        attribs: { ...attributes, controls: '' },
      }),
    },
  });
}
