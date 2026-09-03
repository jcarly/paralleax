import type { ParsedScene, SourceLine } from './models.js';
export {
  escapeImportedHtml as escapeHtml,
  truncateImportedText as truncate,
  uniqueImportedValues as unique,
} from '../source-utils.js';

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

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
