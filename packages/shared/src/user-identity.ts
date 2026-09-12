export const MIN_USER_DISPLAY_NAME_LENGTH = 2;
export const MAX_USER_DISPLAY_NAME_LENGTH = 50;

export interface UserDisplayIdentity {
  id: string;
  displayName: string;
}

export function normalizeUserDisplayName(value: string) {
  return value.trim().replace(/\s+/gu, ' ');
}

export function isValidUserDisplayName(value: string) {
  const normalized = normalizeUserDisplayName(value);
  const characters = Array.from(normalized);
  const length = characters.length;
  return (
    length >= MIN_USER_DISPLAY_NAME_LENGTH &&
    length <= MAX_USER_DISPLAY_NAME_LENGTH &&
    characters.every((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 0x1f && codePoint !== 0x7f;
    })
  );
}
