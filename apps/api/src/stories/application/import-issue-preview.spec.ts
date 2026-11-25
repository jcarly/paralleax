import { ImportIssuePreview } from './import-issue-preview';

it('bounds the preview, prioritizes blocking errors, and preserves their source order', () => {
  const preview = new ImportIssuePreview();
  for (let index = 0; index < 100_000; index += 1) {
    preview.capture({ severity: 'warning', code: 'warning', message: String(index) });
  }
  preview.capture({ severity: 'error', code: 'error', message: 'blocking' });
  const issues = preview.snapshot();
  expect(issues).toHaveLength(50);
  expect(issues[0]?.message).toBe('1');
  expect(issues.at(-1)?.message).toBe('blocking');
});
