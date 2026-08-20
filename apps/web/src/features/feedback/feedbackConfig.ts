import packageMetadata from '../../../package.json';

export interface FormbricksFeedbackConfig {
  appUrl: string;
  workspaceId: string;
}

function normalizeAppUrl(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function parseFormbricksFeedbackConfig(
  workspaceIdValue: string | undefined,
  appUrlValue: string | undefined,
): FormbricksFeedbackConfig | null {
  const workspaceId = workspaceIdValue?.trim();
  const appUrl = normalizeAppUrl(appUrlValue);
  return workspaceId && appUrl ? { workspaceId, appUrl } : null;
}

export const formbricksFeedbackConfig = parseFormbricksFeedbackConfig(
  import.meta.env.VITE_FORMBRICKS_WORKSPACE_ID,
  import.meta.env.VITE_FORMBRICKS_APP_URL,
);

export const paralleaxVersion = packageMetadata.version;
