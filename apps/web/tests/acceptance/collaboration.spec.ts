import { expect, test } from '@playwright/test';
import {
  createdInteraction,
  expectSuccessful,
  interactionNode,
  registerAndCreateStory,
  registerUser,
  waitForApiResponse,
  waitForInteractionPatch,
} from './realStackTestHarness';

test('an owner grants reader then editor access and receives the collaborator edit live', async ({
  browser,
  page: ownerPage,
}, testInfo) => {
  const { storyId, storyTitle } = await registerAndCreateStory(
    ownerPage,
    'Collaboration acceptance',
  );

  const rootCreation = waitForApiResponse(
    ownerPage,
    'POST',
    /\/api\/stories\/[^/]+\/interactions$/,
  );
  await ownerPage.getByRole('button', { name: 'Add root' }).click();
  await createdInteraction(rootCreation);

  await interactionNode(ownerPage, 'New interaction').click();
  const ownerInspector = ownerPage.getByRole('complementary', { name: 'Inspector' });
  const initialTitleUpdate = waitForInteractionPatch(ownerPage);
  await ownerInspector.getByLabel('Title').fill('Shared opening');
  await ownerInspector.getByLabel('Title').blur();
  await expectSuccessful(initialTitleUpdate);

  const collaboratorContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    locale: 'en-US',
  });
  const collaboratorPage = await collaboratorContext.newPage();

  try {
    const collaborator = await registerUser(collaboratorPage, 'Collaboration editor');

    await ownerPage.getByRole('link', { name: 'Stories', exact: true }).click();
    await expect(ownerPage.getByRole('region', { name: 'Loading stories' })).toBeHidden();
    const ownerStoryCard = ownerPage.locator('.library-card').filter({ hasText: storyTitle });
    await ownerStoryCard.getByRole('link', { name: 'Access' }).click();
    await expect(ownerPage.getByRole('heading', { name: 'Access and permissions' })).toBeVisible();

    await ownerPage
      .getByLabel('Who can read this story?')
      .selectOption({ label: 'Invited users only' });
    await ownerPage
      .getByLabel('Who can edit this story?')
      .selectOption({ label: 'Invited editors' });
    await expect(ownerPage.getByLabel('Who can read this story?')).toHaveValue('invitation');
    await expect(ownerPage.getByLabel('Who can edit this story?')).toHaveValue('collaborators');
    const accessUpdate = waitForApiResponse(
      ownerPage,
      'PATCH',
      new RegExp(`/api/stories/${storyId}/access$`),
    );
    await ownerPage.getByRole('button', { name: 'Save access' }).click();
    await expectSuccessful(accessUpdate);

    await ownerPage.getByLabel('Account email').fill(collaborator.email);
    const readerInvitation = waitForApiResponse(
      ownerPage,
      'POST',
      new RegExp(`/api/stories/${storyId}/access/collaborators$`),
    );
    await ownerPage.getByRole('button', { name: 'Add invitation' }).click();
    await expectSuccessful(readerInvitation);
    const collaboratorGrant = ownerPage.locator('.access-list li').filter({
      hasText: collaborator.email,
    });
    await expect(collaboratorGrant).toBeVisible();
    await expect(collaboratorGrant.getByText('Reader', { exact: true })).toBeVisible();

    await collaboratorPage.goto('/');
    await expect(collaboratorPage.getByRole('region', { name: 'Loading stories' })).toBeHidden();
    let collaboratorStoryCard = collaboratorPage
      .locator('.library-card')
      .filter({ hasText: storyTitle });
    await expect(collaboratorStoryCard).toBeVisible();
    await expect(collaboratorStoryCard.getByRole('link', { name: 'Read' })).toBeVisible();
    await expect(collaboratorStoryCard.getByRole('link', { name: 'Edit' })).toHaveCount(0);
    await expect(collaboratorStoryCard.getByRole('link', { name: 'Access' })).toHaveCount(0);

    await collaboratorPage.goto(`/stories/${storyId}/edit`);
    await expect(collaboratorPage).toHaveURL(new RegExp(`/stories/${storyId}/play$`));
    await expect(collaboratorPage.getByRole('button', { name: 'Shared opening' })).toBeVisible();
    await collaboratorPage.getByRole('button', { name: 'Shared opening' }).click();
    await expect(collaboratorPage.getByRole('heading', { name: 'Shared opening' })).toBeVisible();

    await ownerPage.getByLabel('Account email').fill(collaborator.email);
    await ownerPage.getByLabel('Permission').selectOption({ label: 'Editor' });
    const editorInvitation = waitForApiResponse(
      ownerPage,
      'POST',
      new RegExp(`/api/stories/${storyId}/access/collaborators$`),
    );
    await ownerPage.getByRole('button', { name: 'Add invitation' }).click();
    await expectSuccessful(editorInvitation);
    await expect(collaboratorGrant.getByText('Editor', { exact: true })).toBeVisible();

    const ownerEventStream = waitForApiResponse(
      ownerPage,
      'GET',
      new RegExp(`/api/stories/${storyId}/events$`),
    );
    await ownerPage.getByRole('link', { name: 'Back to editor' }).click();
    await expectSuccessful(ownerEventStream);
    await expect(interactionNode(ownerPage, 'Shared opening')).toBeVisible();
    await interactionNode(ownerPage, 'Shared opening').click();

    await collaboratorPage.goto('/');
    await expect(collaboratorPage.getByRole('region', { name: 'Loading stories' })).toBeHidden();
    collaboratorStoryCard = collaboratorPage
      .locator('.library-card')
      .filter({ hasText: storyTitle });
    await expect(collaboratorStoryCard.getByRole('link', { name: 'Edit' })).toBeVisible();
    await expect(collaboratorStoryCard.getByRole('link', { name: 'Access' })).toHaveCount(0);
    await collaboratorStoryCard.getByRole('link', { name: 'Edit' }).click();
    await expect(interactionNode(collaboratorPage, 'Shared opening')).toBeVisible();

    await interactionNode(collaboratorPage, 'Shared opening').click();
    const collaboratorInspector = collaboratorPage.getByRole('complementary', {
      name: 'Inspector',
    });
    const collaboratorUpdate = waitForInteractionPatch(collaboratorPage);
    await collaboratorInspector.getByLabel('Title').fill('Changed by collaborator');
    await collaboratorInspector.getByLabel('Title').blur();
    await expectSuccessful(collaboratorUpdate);

    await expect(interactionNode(ownerPage, 'Changed by collaborator')).toBeVisible();
    await expect(ownerInspector.getByLabel('Title')).toHaveValue('Changed by collaborator');

    await ownerPage.reload();
    await collaboratorPage.reload();
    await expect(interactionNode(ownerPage, 'Changed by collaborator')).toBeVisible();
    await expect(interactionNode(collaboratorPage, 'Changed by collaborator')).toBeVisible();
  } finally {
    await collaboratorContext.close();
  }
});
