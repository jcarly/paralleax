export function getVariableMarkerSource(marker: HTMLElement): string {
  return (
    marker.querySelector<HTMLElement>('[data-rich-text-variable-edit]')?.dataset
      .richTextVariableSource ??
    marker.textContent ??
    ''
  );
}

export function getVariableMarkerExpression(marker: HTMLElement): string {
  const source = getVariableMarkerSource(marker).trim();
  const match = /^\{\{([\s\S]*)\}\}$/.exec(source);
  return match?.[1] ?? source;
}

export function getInteractionLinkText(marker: HTMLElement): string {
  return (
    marker.querySelector<HTMLElement>('[data-rich-text-interaction-link-edit]')?.dataset
      .richTextInteractionLinkText ??
    marker.textContent ??
    ''
  );
}

export function ensureRichTextTokenControls(
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

export function serializeRichTextEditorHtml(editor: HTMLDivElement | null): string {
  const clone = editor?.cloneNode(true) as HTMLDivElement | undefined;
  clone
    ?.querySelectorAll<HTMLElement>('[data-conditional-text-target], [data-conditional-text-block]')
    .forEach((frame) => {
      frame.classList.remove('conditional-text', 'conditional-text-unavailable');
      if (frame.classList.length === 0) frame.removeAttribute('class');
      frame.removeAttribute('title');
      frame.querySelector('.conditional-text-reason')?.remove();
      frame.querySelector('[data-rich-text-conditional-controls]')?.remove();
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
