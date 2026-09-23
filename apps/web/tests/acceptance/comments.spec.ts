import { expect, test } from '@playwright/test';
import {
  configureStoryAccess,
  createdInteraction,
  expectSuccessful,
  interactionNode,
  inviteStoryCollaborator,
  openStoryAccess,
  registerAndCreateStory,
  registerUser,
  waitForApiResponse,
  waitForInteractionPatch,
} from './realStackTestHarness';

test('a reader and an author review an interaction through persisted live comments', async ({
  browser,
  page: ownerPage,
}, testInfo) => {
  const { storyId, storyTitle } = await registerAndCreateStory(ownerPage, 'Review acceptance');

  const rootCreation = waitForApiResponse(
    ownerPage,
    'POST',
    /\/api\/stories\/[^/]+\/interactions$/,
  );
  await ownerPage.getByRole('button', { name: 'Add root' }).click();
  await createdInteraction(rootCreation);

  await interactionNode(ownerPage, 'New interaction').click();
  const ownerInspector = ownerPage.getByRole('complementary', { name: 'Inspector' });
  const titleUpdate = waitForInteractionPatch(ownerPage);
  await ownerInspector.getByLabel('Title').fill('Reviewed opening');
  await ownerInspector.getByLabel('Title').blur();
  await expectSuccessful(titleUpdate);

  const readerContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    locale: 'en-US',
  });
  const readerPage = await readerContext.newPage();

  try {
    const reader = await registerUser(readerPage, 'Review reader');

    await openStoryAccess(ownerPage, storyTitle);
    await configureStoryAccess(ownerPage, storyId, {
      visibility: 'invitation',
      editPolicy: 'owner',
      commentPolicy: 'readers',
    });
    await inviteStoryCollaborator(ownerPage, storyId, reader.email);

    await ownerPage.getByRole('button', { name: 'Close Story settings' }).click();
    await expect(interactionNode(ownerPage, 'Reviewed opening')).toBeVisible();

    const readerCommentStream = waitForApiResponse(
      readerPage,
      'GET',
      new RegExp(`/api/stories/${storyId}/comment-threads/events$`),
    );
    await readerPage.goto(`/stories/${storyId}/play`);
    await expectSuccessful(readerCommentStream);

    await readerPage.getByRole('button', { name: 'Reviewed opening' }).click();
    await expect(readerPage.getByRole('heading', { name: 'Reviewed opening' })).toBeVisible();
    await readerPage.getByRole('button', { name: 'Comment on this scene' }).click();

    const readerComments = readerPage.getByRole('complementary', { name: 'Story comments' });
    const threadCreation = waitForApiResponse(
      readerPage,
      'POST',
      new RegExp(`/api/stories/${storyId}/comment-threads$`),
    );
    await readerComments
      .getByRole('textbox', { name: 'Comment' })
      .fill('Could this opening be clearer?');
    await readerComments.getByRole('button', { name: 'Send' }).click();
    const threadResponse = await expectSuccessful(threadCreation);
    const thread = (await threadResponse.json()) as { id: string };

    const ownerCommentsButton = ownerPage.getByRole('button', { name: /^Comments/ });
    await expect(ownerCommentsButton).toContainText('1');
    await ownerCommentsButton.click();
    const ownerComments = ownerPage.getByRole('complementary', { name: 'Story comments' });
    await ownerComments
      .getByRole('button')
      .filter({ hasText: 'Could this opening be clearer?' })
      .click();

    await expect(ownerInspector.getByLabel('Title')).toHaveValue('Reviewed opening');
    const contextualComments = ownerPage.getByRole('complementary', {
      name: 'Comments for the selected element',
    });
    await expect(contextualComments.getByText('Could this opening be clearer?')).toBeVisible();

    const replyCreation = waitForApiResponse(
      ownerPage,
      'POST',
      new RegExp(`/api/stories/${storyId}/comment-threads/${thread.id}/messages$`),
    );
    await contextualComments
      .getByRole('textbox', { name: 'Reply' })
      .fill('Yes, I will clarify it.');
    await contextualComments.getByRole('button', { name: 'Send' }).click();
    await expectSuccessful(replyCreation);
    await expect(readerComments.getByText('Yes, I will clarify it.')).toBeVisible();

    const resolution = waitForApiResponse(
      ownerPage,
      'PATCH',
      new RegExp(`/api/stories/${storyId}/comment-threads/${thread.id}/status$`),
    );
    await contextualComments.getByRole('button', { name: 'Resolve' }).click();
    await expectSuccessful(resolution);
    await expect(readerComments.getByText('Resolved', { exact: true })).toBeVisible();

    await readerPage.reload();
    await expect(readerPage.getByRole('heading', { name: 'Reviewed opening' })).toBeVisible();
    await readerPage.getByRole('button', { name: /^Comments/ }).click();
    const reloadedComments = readerPage.getByRole('complementary', { name: 'Story comments' });
    await reloadedComments.getByRole('button', { name: 'Resolved' }).click();
    await reloadedComments.getByRole('button').filter({ hasText: 'Reviewed opening' }).click();
    await expect(reloadedComments.getByText('Yes, I will clarify it.')).toBeVisible();
    await expect(reloadedComments.getByText('Resolved', { exact: true })).toBeVisible();

    const deletion = waitForApiResponse(
      readerPage,
      'DELETE',
      new RegExp(`/api/stories/${storyId}/comment-threads/${thread.id}$`),
    );
    readerPage.once('dialog', (dialog) => dialog.accept());
    await reloadedComments.getByRole('button', { name: 'Delete discussion' }).click();
    await expectSuccessful(deletion);
    await expect(reloadedComments.getByText('Could this opening be clearer?')).toHaveCount(0);

    const deletedProjection = readerPage.waitForResponse(
      (response) => {
        const request = response.request();
        const url = new URL(response.url());
        return (
          request.method() === 'GET' &&
          url.pathname === `/api/stories/${storyId}/comment-threads` &&
          url.searchParams.get('includeDeleted') === 'true'
        );
      },
      { timeout: 60_000 },
    );
    await reloadedComments.getByRole('button', { name: 'Deleted' }).click();
    await expectSuccessful(deletedProjection);
    await reloadedComments.getByRole('button').filter({ hasText: 'Reviewed opening' }).click();
    await expect(reloadedComments.getByText('Yes, I will clarify it.')).toBeVisible();

    const restoration = waitForApiResponse(
      readerPage,
      'PATCH',
      new RegExp(`/api/stories/${storyId}/comment-threads/${thread.id}/restore$`),
    );
    await reloadedComments.getByRole('button', { name: 'Restore' }).click();
    await expectSuccessful(restoration);
    await expect(reloadedComments.getByText('Resolved', { exact: true })).toBeVisible();
    await expect(reloadedComments.getByText('Yes, I will clarify it.')).toBeVisible();
  } finally {
    await readerContext.close();
  }
});
