import { expect, test } from '@playwright/test';
import {
  createdInteraction,
  editInspectorField,
  editInteraction,
  expectSuccessful,
  interactionNode,
  registerAndCreateStory,
  waitForApiResponse,
  waitForInteractionPatch,
  waitForTriggerPatch,
} from './realStackTestHarness';

test('an author creates, persists, resumes, and simulates a conditional story', async ({
  page,
}) => {
  const { email, password, storyTitle } = await registerAndCreateStory(page, 'Alpha acceptance');

  const locationCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/locations$/);
  await page.getByRole('button', { name: 'Add location' }).click();
  await expectSuccessful(locationCreation);
  await editInspectorField(page, 'Name', 'Atrium', /\/locations\/[^/]+$/);

  const characterCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/characters$/);
  await page.getByRole('button', { name: 'Add character' }).click();
  await expectSuccessful(characterCreation);
  await editInspectorField(page, 'Name', 'Alice', /\/characters\/[^/]+$/);

  await page.getByRole('button', { name: 'Add variable' }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const variableCreation = waitForApiResponse(
    page,
    'POST',
    /\/api\/stories\/[^/]+\/stat-definitions$/,
  );
  await inspector.getByLabel('Name').fill('Courage');
  await inspector.getByRole('button', { name: 'Create', exact: true }).click();
  await expectSuccessful(variableCreation);
  await expect(inspector.getByRole('heading', { name: 'Variable', exact: true })).toBeVisible();

  await inspector.getByLabel('Attach to').selectOption({ label: 'Story' });
  await inspector.getByLabel('Initial value', { exact: true }).fill('0');
  const assignmentCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/stats$/);
  await inspector.getByRole('button', { name: 'Assign' }).click();
  await expectSuccessful(assignmentCreation);

  const rootCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/interactions$/);
  await page.getByRole('button', { name: 'Add root' }).click();
  const root = await createdInteraction(rootCreation);
  await editInteraction(page, 'New interaction', 'Opening', 'Alice enters the atrium.');

  let openingNode = interactionNode(page, 'Opening');
  await openingNode.click();
  const locationAssignment = waitForInteractionPatch(page);
  await inspector.getByLabel('Location').selectOption({ label: 'Atrium' });
  await expectSuccessful(locationAssignment);
  const characterAssignment = waitForInteractionPatch(page);
  await inspector.getByRole('checkbox', { name: 'Alice' }).check();
  await expectSuccessful(characterAssignment);

  const middleCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/interactions$/);
  await openingNode.getByRole('button', { name: 'Create child interaction' }).click();
  const middle = await createdInteraction(middleCreation);
  await editInteraction(page, 'New interaction', 'Gain courage', 'Alice chooses to continue.');

  const effectCreation = waitForInteractionPatch(page);
  await inspector.getByRole('button', { name: 'Add effect' }).click();
  await inspector
    .getByRole('group', { name: 'Effect type' })
    .getByRole('button', { name: 'Variable' })
    .click();
  await expectSuccessful(effectCreation);
  await expect(inspector.getByLabel('Variable effect target')).toHaveValue(/Courage/);
  await expect(inspector.getByLabel('Variable effect value')).toHaveValue('1');
  await expect(page.getByLabel('Story save status')).toHaveText('Saved');

  await interactionNode(page, 'Gain courage').click();
  const finalCreation = waitForApiResponse(page, 'POST', /\/api\/stories\/[^/]+\/interactions$/);
  await interactionNode(page, 'Gain courage')
    .getByRole('button', { name: 'Create child interaction' })
    .click();
  const final = await createdInteraction(finalCreation);
  await editInteraction(page, 'New interaction', 'Resolve', 'The path is now open.');

  const finalTriggerId = final.triggers[0]?.id;
  expect(finalTriggerId).toBeTruthy();
  await page.getByTestId(`flow-trigger-${final.id}-${finalTriggerId}`).click();
  const conditionCreation = waitForTriggerPatch(page);
  await inspector.getByRole('button', { name: 'Add condition' }).click();
  await inspector
    .getByRole('group', { name: 'Condition type' })
    .getByRole('button', { name: 'Variable' })
    .click();
  await expectSuccessful(conditionCreation);
  const conditionValue = inspector.getByLabel('Variable condition value');
  const conditionUpdate = waitForTriggerPatch(page);
  await conditionValue.fill('1');
  await expectSuccessful(conditionUpdate);
  await expect(inspector.getByLabel('Variable condition operator')).toHaveValue('gte');

  await page.reload();
  await expect(page.locator('.story-title-input')).toHaveValue(storyTitle);
  await expect(interactionNode(page, 'Opening')).toBeVisible();
  await expect(interactionNode(page, 'Gain courage')).toBeVisible();
  await expect(interactionNode(page, 'Resolve')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atrium', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Alice', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Courage', exact: true })).toBeVisible();
  await interactionNode(page, 'Opening').click();
  await expect(inspector.getByRole('textbox', { name: 'Content' })).toHaveText(
    'Alice enters the atrium.',
  );
  await expect(inspector.getByLabel('Location').locator('option:checked')).toHaveText('Atrium');
  await expect(inspector.getByRole('checkbox', { name: 'Alice' })).toBeChecked();
  await interactionNode(page, 'Gain courage').click();
  await expect(inspector.getByLabel('Variable effect target')).toHaveValue(/Courage/);
  await expect(inspector.getByLabel('Variable effect value')).toHaveValue('1');
  await page.getByTestId(`flow-trigger-${final.id}-${finalTriggerId}`).click();
  await expect(inspector.getByLabel('Variable condition value')).toHaveValue('1');

  await page.getByRole('link', { name: 'Stories', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Loading stories' })).toBeHidden();
  let storyCard = page.locator('.library-card').filter({ hasText: storyTitle });
  await expect(storyCard).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const login = waitForApiResponse(page, 'POST', /\/api\/auth\/login$/);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expectSuccessful(login);

  await expect(page.getByRole('region', { name: 'Loading stories' })).toBeHidden();
  storyCard = page.locator('.library-card').filter({ hasText: storyTitle });
  await expect(storyCard).toBeVisible();
  await storyCard.getByRole('link', { name: 'Edit' }).click();
  await expect(page.locator('.story-title-input')).toHaveValue(storyTitle);
  openingNode = interactionNode(page, 'Opening');
  await openingNode.click();
  await page.getByRole('link', { name: 'Test from current interaction' }).click();

  await expect(page.getByText('Simulation', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Opening');
  await page.getByRole('button', { name: 'Gain courage' }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Gain courage');
  await expect(page.getByRole('button', { name: 'Resolve' })).toBeEnabled();
  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Resolve');

  expect(root.id).not.toBe(middle.id);
});
