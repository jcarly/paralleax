import type { ParsedScene, SourceLine } from './models.js';

export function normalizeIdentifier(value: string | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
}

export function humanizeIdentifier(value: string) {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Interaction';
}

export function sceneAnchor(scene: string) {
  return `scene:${normalizeIdentifier(scene)}`;
}

export function labelAnchor(scene: string, label: string) {
  return `${sceneAnchor(scene)}#${normalizeIdentifier(label)}`;
}

export function displayAnchor(anchor: string) {
  return anchor.replace(/^scene:/, '').replace('#', ' / ');
}

export function fallbackSource(scene: ParsedScene): SourceLine {
  return { fileName: scene.fileName, sceneName: scene.name, number: 1, indent: 0, text: '' };
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function truncate(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}

export function unique(values: string[]) {
  return [...new Set(values)];
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
