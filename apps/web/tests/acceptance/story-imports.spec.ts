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

  const firstResponse = await expectSuccessful(qspImport);
  const firstResult = (await firstResponse.json()) as {
    status: string;
    importId: string;
    report: {
      warningCount: number;
      errorCount: number;
    };
  };

  expect(firstResult.status).toBe('confirmation_required');
  expect(firstResult.report).toMatchObject({ warningCount: 2, errorCount: 0 });

  const reportResponse = await page.request.get(`/api/imports/${firstResult.importId}/report`);
  expect(reportResponse.ok()).toBe(true);
  expect(reportResponse.headers()['content-type']).toContain('application/x-ndjson');
  const reportIssues = (await reportResponse.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { code: string; severity: string });
  expect(reportIssues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'automatic_navigation_requires_choice',
        severity: 'warning',
      }),
      expect.objectContaining({
        code: 'unreachable_location_imported_as_root',
        severity: 'warning',
      }),
    ]),
  );

  const reviewDialog = page.getByRole('dialog', {
    name: 'Review the import report',
  });

  await expect(reviewDialog.getByText('QSP compatibility coverage')).toBeVisible();

  // Confirm the compatibility warnings.
  const confirmedImport = waitForApiResponse(
    page,
    'POST',
    /\/api\/stories\/imports\/qsp(?:\/admin)?$/,
  );

  await reviewDialog.getByRole('button', { name: 'Confirm import' }).click();

  const confirmedResponse = await expectSuccessful(confirmedImport);

  const qspResult = (await confirmedResponse.json()) as {
    status: string;
    story: { id: string };
  };

  expect(qspResult.status).toBe('imported');

  const qspDialog = page.getByRole('dialog', {
    name: 'QSP story imported',
  });

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
