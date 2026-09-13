import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import type matchers from '@testing-library/jest-dom/matchers';
import { beforeEach, expect } from 'vitest';
import { i18n, languageStorageKey } from '../i18n';

declare module 'vitest' {
  // Declaration merging intentionally extends Vitest without adding members.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<
    R extends void | Promise<void> = void,
    T = unknown,
  > extends matchers.TestingLibraryMatchers<T, R> {}

  // Declaration merging intentionally extends Vitest without adding members.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends matchers.TestingLibraryMatchers<unknown, void> {}
}

expect.extend(jestDomMatchers);

beforeEach(async () => {
  await i18n.changeLanguage('en');
  window.localStorage.removeItem(languageStorageKey);
});
