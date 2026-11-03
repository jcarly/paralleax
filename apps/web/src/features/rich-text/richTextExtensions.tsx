import { Node, mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { RichTextExtensionContextStore } from './richTextEditorTypes';
import {
  ConditionalTextNodeView,
  InteractionLinkNodeView,
  StatValueNodeView,
} from './RichTextNodeViews';

type RichTextExtensionOptions = { contextStore?: RichTextExtensionContextStore };

function conditionalTextAttributes(contextStore?: RichTextExtensionContextStore) {
  return {
    blockId: {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute('data-conditional-text-block'),
      renderHTML: ({ blockId }: { blockId: string | null }) =>
        blockId ? { 'data-conditional-text-block': blockId } : {},
    },
    conditions: {
      default: [],
      parseHTML: (element: HTMLElement) =>
        contextStore?.current.conditionalTextBlocks.find(
          ({ id }) => id === element.getAttribute('data-conditional-text-block'),
        )?.conditions ?? [],
      renderHTML: () => ({}),
    },
    contextRevision: {
      default: 0,
      parseHTML: () => 0,
      renderHTML: () => ({}),
    },
  };
}

export function createRichTextExtensions(contextStore: RichTextExtensionContextStore) {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      heading: { levels: [2, 3] },
      horizontalRule: false,
      link: {
        autolink: false,
        linkOnPaste: false,
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      },
      trailingNode: false,
    }),
    Image.configure({ inline: true, allowBase64: false }),
    LegacyConditionalFrame,
    LegacyConditionalLink,
    InteractionLink.configure({ contextStore }),
    StatValue.configure({ contextStore }),
    ConditionalTextBlock.configure({ contextStore }),
    ConditionalTextInline.configure({ contextStore }),
    RichTextVideo,
    RichTextIframe,
    RichTextDiv,
    RichTextSpan,
  ];
}

const ConditionalTextBlock = Node.create<RichTextExtensionOptions>({
  name: 'conditionalTextBlock',
  addOptions() {
    return {};
  },
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return conditionalTextAttributes(this.options.contextStore);
  },

  parseHTML() {
    return [{ tag: 'div[data-conditional-text-block]', priority: 100 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ConditionalTextNodeView);
  },
});

const ConditionalTextInline = Node.create<RichTextExtensionOptions>({
  name: 'conditionalTextInline',
  addOptions() {
    return {};
  },
  group: 'inline',
  inline: true,
  content: 'inline*',
  defining: true,
  isolating: true,

  addAttributes() {
    return conditionalTextAttributes(this.options.contextStore);
  },

  parseHTML() {
    return [{ tag: 'span[data-conditional-text-block]', priority: 100 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ConditionalTextNodeView, { contentDOMElementTag: 'span' });
  },
});

const LegacyConditionalFrame = Node.create({
  name: 'legacyConditionalFrame',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-conditional-text-target'),
        renderHTML: ({ targetId }: { targetId: string | null }) =>
          targetId ? { 'data-conditional-text-target': targetId } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-conditional-text-target]', priority: 100 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes), 0];
  },
});

const LegacyConditionalLink = Node.create({
  name: 'legacyConditionalLink',
  group: 'block',
  content: 'text*',
  atom: true,
  selectable: true,
  defining: true,

  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-conditional-text-link'),
        renderHTML: ({ targetId }: { targetId: string | null }) =>
          targetId ? { 'data-conditional-text-link': targetId } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'button[data-conditional-text-link]', priority: 100 }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'button',
      mergeAttributes(HTMLAttributes, { type: 'button', contenteditable: 'false' }),
      0,
    ];
  },
});

const InteractionLink = Node.create<RichTextExtensionOptions>({
  name: 'interactionLink',
  addOptions() {
    return {};
  },
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-interaction-link-target'),
        renderHTML: ({ targetId }: { targetId: string | null }) =>
          targetId ? { 'data-interaction-link-target': targetId } : {},
      },
      text: {
        default: '',
        parseHTML: (element: HTMLElement) => element.textContent ?? '',
        renderHTML: () => ({}),
      },
      contextRevision: {
        default: 0,
        parseHTML: () => 0,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-interaction-link-target]', priority: 100 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { contenteditable: 'false' }),
      node.attrs.text ?? '',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InteractionLinkNodeView);
  },
});

const StatValue = Node.create<RichTextExtensionOptions>({
  name: 'statValue',
  addOptions() {
    return {};
  },
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      assignmentId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-stat-value'),
        renderHTML: ({ assignmentId }: { assignmentId: string | null }) =>
          assignmentId ? { 'data-stat-value': assignmentId } : {},
      },
      itemId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-stat-item'),
        renderHTML: ({ itemId }: { itemId: string | null }) =>
          itemId ? { 'data-stat-item': itemId } : {},
      },
      sourceText: {
        default: '',
        parseHTML: (element: HTMLElement) => element.textContent ?? '',
        renderHTML: () => ({}),
      },
      contextRevision: {
        default: 0,
        parseHTML: () => 0,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-stat-value]', priority: 100 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { contenteditable: 'false' }),
      node.attrs.sourceText ?? '',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(StatValueNodeView);
  },
});

const RichTextVideo = Node.create({
  name: 'richTextVideo',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('src'),
        renderHTML: ({ src }: { src: string | null }) => (src ? { src } : {}),
      },
      poster: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('poster'),
        renderHTML: ({ poster }: { poster: string | null }) => (poster ? { poster } : {}),
      },
      sources: {
        default: [],
        parseHTML: (element: HTMLElement) =>
          Array.from(element.querySelectorAll('source')).map((source) => ({
            src: source.getAttribute('src') ?? '',
            type: source.getAttribute('type') ?? '',
          })),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'video', priority: 100 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const sources = readVideoSources(node.attrs.sources);
    const children = sources.map((source) => [
      'source',
      { src: source.src, ...(source.type ? { type: source.type } : {}) },
    ]);
    return ['video', mergeAttributes(HTMLAttributes, { controls: '' }), ...children];
  },
});

function readVideoSources(value: unknown) {
  const sources: { src: string; type: string }[] = [];
  if (!Array.isArray(value)) {
    return sources;
  }
  for (const entry of value) {
    const item: unknown = entry;
    if (!isRecord(item)) {
      continue;
    }
    const src: unknown = Reflect.get(item, 'src');
    const type: unknown = Reflect.get(item, 'type');
    if (typeof src === 'string' && typeof type === 'string') {
      sources.push({ src, type });
    }
  }
  return sources;
}

function isRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

const RichTextIframe = Node.create({
  name: 'richTextIframe',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('src'),
        renderHTML: ({ src }: { src: string | null }) => (src ? { src } : {}),
      },
      title: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('title'),
        renderHTML: ({ title }: { title: string | null }) => (title ? { title } : {}),
      },
      allow: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('allow'),
        renderHTML: ({ allow }: { allow: string | null }) => (allow ? { allow } : {}),
      },
      allowfullscreen: {
        default: null,
        parseHTML: (element: HTMLElement) => element.hasAttribute('allowfullscreen'),
        renderHTML: ({ allowfullscreen }: { allowfullscreen: boolean | null }) =>
          allowfullscreen ? { allowfullscreen: '' } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'iframe', priority: 100 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['iframe', mergeAttributes(HTMLAttributes)];
  },
});

const RichTextDiv = Node.create({
  name: 'richTextDiv',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div', priority: 1 }];
  },

  renderHTML() {
    return ['div', 0];
  },
});

const RichTextSpan = Node.create({
  name: 'richTextSpan',
  group: 'inline',
  inline: true,
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'span', priority: 1 }];
  },

  renderHTML() {
    return ['span', 0];
  },
});
