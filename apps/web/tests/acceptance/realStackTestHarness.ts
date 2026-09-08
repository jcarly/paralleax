import { expect, type Page, type Response } from '@playwright/test';

interface CreatedInteraction {
  id: string;
  triggers: Array<{ id: string }>;
}

export interface AcceptanceAccount {
  email: string;
  password: string;
}

interface AcceptanceStorySession extends AcceptanceAccount {
  storyId: string;
  storyTitle: string;
}

const accessCode = process.env.PARALLEAX_ACCEPTANCE_ACCESS_CODE ?? 'playwright-alpha-access-code';

export async function registerAndCreateStory(
  page: Page,
  prefix: string,
): Promise<AcceptanceStorySession> {
  const account = await registerUser(page, prefix);
  const { storyId, storyTitle } = await createStory(page, prefix);

  return { ...account, storyId, storyTitle };
}

export async function registerUser(page: Page, prefix: string): Promise<AcceptanceAccount> {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const emailPrefix = prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const email = `${emailPrefix}-${runId}@example.com`;
  const password = 'acceptance-test-password';

  await page.goto('/register');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByLabel('Invitation code').fill(accessCode);
  const registration = waitForApiResponse(page, 'POST', /\/api\/auth\/register$/);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expectSuccessful(registration);

  await expect(page.getByRole('heading', { name: 'Stories', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Loading stories' })).toBeHidden();

  return { email, password };
}

export async function createStory(page: Page, prefix: string) {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storyTitle = `${prefix} ${runId}`;

  await page.getByRole('button', { name: 'New story' }).click();
  await page.getByLabel('Story title').fill(storyTitle);
  const storyCreation = waitForApiResponse(page, 'POST', /\/api\/stories$/);
  await page.getByRole('button', { name: 'Create story' }).click();
  const response = await expectSuccessful(storyCreation);
  const story = (await response.json()) as { id: string };

  const storyCard = page.locator('.library-card').filter({ hasText: storyTitle });
  await expect(storyCard).toBeVisible();
  await storyCard.getByRole('link', { name: 'Edit' }).click();
  await expect(page.locator('.story-title-input')).toHaveValue(storyTitle);
  await expect(page.getByRole('button', { name: 'Add root' })).toBeVisible();

  return { storyId: story.id, storyTitle };
}

export function interactionNode(page: Page, title: string) {
  return page.getByTestId('interaction-node').filter({ hasText: title });
}

export async function editInteraction(
  page: Page,
  currentTitle: string,
  title: string,
  body: string,
) {
  await interactionNode(page, currentTitle).last().click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const titleUpdate = waitForInteractionPatch(page);
  await inspector.getByLabel('Title').fill(title);
  await inspector.getByLabel('Title').blur();
  await expectSuccessful(titleUpdate);

  const bodyUpdate = waitForInteractionPatch(page);
  await inspector.getByRole('textbox', { name: 'Content' }).fill(body);
  await inspector.getByRole('textbox', { name: 'Content' }).blur();
  await expectSuccessful(bodyUpdate);
}

export async function editInspectorField(page: Page, label: string, value: string, path: RegExp) {
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const update = waitForApiResponse(page, 'PATCH', path);
  await inspector.getByLabel(label, { exact: true }).fill(value);
  await inspector.getByLabel(label, { exact: true }).blur();
  await expectSuccessful(update);
}

export function waitForInteractionPatch(page: Page) {
  return waitForApiResponse(page, 'PATCH', /\/api\/stories\/[^/]+\/interactions\/[^/]+$/);
}

export function waitForTriggerPatch(page: Page) {
  return waitForApiResponse(
    page,
    'PATCH',
    /\/api\/stories\/[^/]+\/interactions\/[^/]+\/triggers\/[^/]+$/,
  );
}

export function waitForApiResponse(page: Page, method: string, path: RegExp) {
  return page.waitForResponse(
    (response) => {
      const request = response.request();
      return request.method() === method && path.test(new URL(response.url()).pathname);
    },
    { timeout: 60_000 },
  );
}

export async function expectSuccessful(responsePromise: Promise<Response>) {
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(
      `${response.request().method()} ${response.url()} returned ${response.status()}: ${await response.text()}`,
    );
  }
  return response;
}

export async function createdInteraction(responsePromise: Promise<Response>) {
  const response = await expectSuccessful(responsePromise);
  const body = (await response.json()) as { interaction: CreatedInteraction };
  return body.interaction;
}

export async function requestApiJson<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await page.request.fetch(path, {
    method,
    ...(data === undefined ? {} : { data }),
  });
  if (!response.ok()) {
    throw new Error(`${method} ${path} returned ${response.status()}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}
