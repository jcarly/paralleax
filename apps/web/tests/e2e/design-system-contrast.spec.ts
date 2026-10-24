import { expect, test, type Locator } from '@playwright/test';
import {
  mockAuthenticatedUser,
  mockRuntimeStory,
  prepareEditorPage,
  story,
} from './editorTestHarness';

test('keeps the reviewed text pairs readable on editor, product, and simulation surfaces', async ({
  page,
}) => {
  await prepareEditorPage(page);
  await page.goto('/stories/story-1/edit');
  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<div id="contrast-fixture">
        <button id="light-focus" type="button" style="background:#ffffff;color:#20221f">Light focus</button>
        <div class="player-top"><button id="dark-focus" type="button" style="background:transparent;color:#ffffff">Dark focus</button></div>
        <div class="location-panel"><button id="context-count" class="context-comment-badge" type="button">3</button></div>
        <button class="comments-toolbar-button" type="button"><small id="toolbar-count">3</small></button>
        <span id="saved-status" class="save-status saved">Saved</span>
        <div class="interaction-node"><span class="interaction-node-location"><span id="place-glyph" aria-hidden="true">⌖</span>Harbor</span></div>
        <label class="product-field"><span>Email</span><input id="placeholder" placeholder="Email address"></label>
        <section class="simulation-controls"><label><span><small id="simulation-help">Used for testing.</small></span></label></section>
        <input id="story-title" class="story-title-input" value="Story title">
        <input id="simulation-title" class="simulation-title-input" value="Scene title">
        <div id="simulation-body" class="rich-text-surface" contenteditable="true">Scene body</div>
      </div>`,
    );
  });
  await expectTextContrast(page.locator('#context-count'), 4.5);
  await page.locator('#context-count').hover();
  await expectTextContrast(page.locator('#context-count'), 4.5);
  await expectTextContrast(page.locator('#toolbar-count'), 4.5);
  await expectTextContrast(page.locator('#saved-status'), 4.5);
  await expectTextContrast(page.locator('#place-glyph'), 3);
  await expectPlaceholderContrast(page.locator('#placeholder'), 4.5);
  await expectTextContrast(page.locator('#simulation-help'), 4.5);

  await page.locator('#story-title').focus();
  await expectBorderContrast(page.locator('#story-title'), 3);
  await page.locator('#simulation-title').focus();
  await expectKeyboardFocusRing(page.locator('#simulation-title'));
  await page.locator('#simulation-body').focus();
  await expectKeyboardFocusRing(page.locator('#simulation-body'));

  for (const id of ['light-focus', 'dark-focus']) {
    const control = page.locator(`#${id}`);
    await control.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(control).toBeFocused();
    await expect
      .poll(() => control.evaluate((element) => element.matches(':focus-visible')))
      .toBe(true);
    await expectKeyboardFocusRing(control);
  }
});

test('applies the focus and help contrast to the rendered Simulation Editor', async ({ page }) => {
  await mockAuthenticatedUser(page, {
    id: 'user-1',
    email: 'reader@example.com',
    displayName: 'Reader',
    role: 'user',
    createdAt: '2026-07-27T08:00:00.000Z',
  });
  await page.route('**/api/stories/story-1/progress', (route) =>
    route.fulfill({ json: { progress: null } }),
  );
  await page.route('**/api/stories/story-1/progress/simulation', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { progress: null } });
      return;
    }
    await route.fulfill({
      json: { state: route.request().postDataJSON(), updatedAt: '2026-10-24T09:00:00.000Z' },
    });
  });
  await page.route('**/api/stories/story-1/progress/saves', (route) => route.fulfill({ json: [] }));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'EventSource', { configurable: true, value: undefined });
  });
  await mockRuntimeStory(page, story);
  await page.goto('/stories/story-1/play?mode=simulation&startInteractionId=interaction-1');

  await expect(page.getByRole('textbox', { name: 'Current interaction content' })).toBeVisible();
  await expectTextContrast(page.locator('.simulation-controls small'), 4.5);
  const richTextSurface = page.getByRole('textbox', { name: 'Current interaction content' });
  await richTextSurface.focus();
  await expect(richTextSurface).toBeFocused();
  await expectKeyboardFocusRing(richTextSurface);
});

async function expectTextContrast(locator: Locator, minimum: number) {
  await expect
    .poll(async () => {
      const colors = await locator.evaluate((element) => {
        const foreground = getComputedStyle(element).color;
        let surface: HTMLElement | null = element as HTMLElement;
        let background = 'rgba(0, 0, 0, 0)';
        while (surface && background === 'rgba(0, 0, 0, 0)') {
          background = getComputedStyle(surface).backgroundColor;
          surface = surface.parentElement;
        }
        return [foreground, background];
      });
      return contrastRatio(parseColor(colors[0]), parseColor(colors[1]));
    })
    .toBeGreaterThanOrEqual(minimum);
}

async function expectPlaceholderContrast(locator: Locator, minimum: number) {
  const colors = await locator.evaluate((element: HTMLInputElement) => {
    return [
      getComputedStyle(element, '::placeholder').color,
      getComputedStyle(element).backgroundColor,
    ];
  });
  const ratio = contrastRatio(parseColor(colors[0]), parseColor(colors[1]));
  expect(ratio, 'placeholder text contrast').toBeGreaterThanOrEqual(minimum);
}

async function expectBorderContrast(locator: Locator, minimum: number) {
  const colors = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.borderTopColor, style.backgroundColor];
  });
  const ratio = contrastRatio(parseColor(colors[0]), parseColor(colors[1]));
  expect(ratio, 'keyboard focus border contrast').toBeGreaterThanOrEqual(minimum);
}

async function expectKeyboardFocusRing(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((element) => getComputedStyle(element).boxShadow))
    .toContain('rgb(47, 98, 80)');
  const ring = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    let surfaceElement: HTMLElement | null = element as HTMLElement;
    let background = 'rgba(0, 0, 0, 0)';
    while (surfaceElement && background === 'rgba(0, 0, 0, 0)') {
      background = getComputedStyle(surfaceElement).backgroundColor;
      surfaceElement = surfaceElement.parentElement;
    }
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      background,
    };
  });
  expect(ring.outlineColor).toBe('rgb(255, 255, 255)');
  expect(ring.outlineStyle).toBe('solid');
  expect(ring.outlineWidth).not.toBe('0px');
  expect(ring.boxShadow).toContain('rgb(47, 98, 80)');
  const surface = parseColor(ring.background);
  expect(
    Math.max(
      contrastRatio(parseColor(ring.outlineColor), surface),
      contrastRatio([47, 98, 80], surface),
    ),
  ).toBeGreaterThanOrEqual(3);
}

function parseColor(value: string): [number, number, number] {
  const channels = value.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) throw new Error(`Expected an RGB color, got ${value}`);
  return [channels[0], channels[1], channels[2]];
}

function contrastRatio(first: [number, number, number], second: [number, number, number]) {
  const luminance = (color: [number, number, number]) => {
    const linear = color.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
