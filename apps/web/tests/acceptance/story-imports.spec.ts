import { expect, test } from '@playwright/test';
import {
  expectSuccessful,
  interactionNode,
  registerUser,
  waitForApiResponse,
} from './realStackTestHarness';

const choiceScriptStartup = `*title Acceptance ChoiceScript
*scene_list
  startup
  ending

You arrive before the storm.
*choice
  #Open the door
    The lock gives way.
    *goto_scene ending
  #Wait outside
    The rain gets heavier.
    *goto_scene ending`;

const choiceScriptEnding = `The hall is dark.
*ending`;

const qspStart = `# start
'You arrive before the storm.'
act 'Enter the room':
  gt 'room', 'inside'
end
--- start ---`;

const qspRoom = `# room
if $ARGS[0] = 'inside':
  'The room is quiet.'
end
--- room ---`;

test('imports and plays a repository ChoiceScript fixture through the real stack', async ({
  page,
}) => {
  test.setTimeout(420_000);
  await registerUser(page, 'Import acceptance');

  await page.getByRole('button', { name: 'Import a story' }).click();
  await page.getByLabel('ChoiceScript scene files').setInputFiles([
    {
      name: 'startup.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(choiceScriptStartup),
    },
    {
      name: 'ending.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(choiceScriptEnding),
    },
  ]);

  const choiceScriptImport = waitForApiResponse(
    page,
    'POST',
    /\/api\/stories\/imports\/choicescript$/,
  );
  await page.getByRole('button', { name: 'Import story' }).click();
  const choiceScriptResponse = await expectSuccessful(choiceScriptImport);
  const choiceScriptResult = (await choiceScriptResponse.json()) as { story: { id: string } };

  const choiceScriptDialog = page.getByRole('dialog', {
    name: 'ChoiceScript story imported',
  });
  await expect(choiceScriptDialog.getByText('No compatibility warning was reported')).toBeVisible();
  await choiceScriptDialog.getByRole('link', { name: 'Open in editor' }).click();

  await expect(page.locator('.story-title-input')).toHaveValue('Acceptance ChoiceScript');
  await expect(interactionNode(page, 'Startup')).toBeVisible();
  await expect(interactionNode(page, 'Open the door')).toBeVisible();
  await expect(interactionNode(page, 'Wait outside')).toBeVisible();
  await expect(interactionNode(page, 'Ending')).toBeVisible();

  await interactionNode(page, 'Startup').click();
  await page.getByRole('link', { name: 'Test from current interaction' }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Startup');
  await page.getByRole('button', { name: 'Open the door' }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Open the door');
  await page.getByRole('button', { name: 'Ending' }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Ending');

  expect(choiceScriptResult.story.id).toBeTruthy();
});

test('imports and plays repository QSP location fixtures through the real stack', async ({
  page,
}) => {
  test.setTimeout(420_000);
  await registerUser(page, 'QSP import acceptance');

  await page.getByRole('button', { name: 'Import a story' }).click();
  await page.getByLabel('Source format').selectOption('qsp');
  await page.getByLabel('QSP game or location files').setInputFiles([
    { name: 'start.qsrc', mimeType: 'text/plain', buffer: Buffer.from(qspStart) },
    { name: 'room.qsrc', mimeType: 'text/plain', buffer: Buffer.from(qspRoom) },
  ]);

  const qspImport = waitForApiResponse(page, 'POST', /\/api\/stories\/imports\/qsp(?:\/admin)?$/);
  await page.getByRole('button', { name: 'Import story' }).click();
  const qspResponse = await expectSuccessful(qspImport);
  const qspResult = (await qspResponse.json()) as { story: { id: string } };

  const qspDialog = page.getByRole('dialog', { name: 'QSP story imported' });
  await expect(qspDialog.getByText('QSP compatibility coverage')).toBeVisible();
  await qspDialog.getByRole('link', { name: 'Open in editor' }).click();

  await expect(page.locator('.story-title-input')).toHaveValue('QSP locations');
  await expect(interactionNode(page, 'start')).toBeVisible();
  await expect(interactionNode(page, 'Enter the room')).toBeVisible();
  await expect(interactionNode(page, 'room · inside')).toBeVisible();

  await interactionNode(page, 'start').click();
  await page.getByRole('link', { name: 'Test from current interaction' }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('start');
  await page.getByRole('button', { name: 'Enter the room' }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('Enter the room');
  await page.getByRole('button', { name: 'room · inside' }).click();
  await expect(page.getByLabel('Current interaction title')).toHaveValue('room · inside');

  expect(qspResult.story.id).toBeTruthy();
});
