import { describe, expect, it } from 'vitest';
import { parseFormbricksFeedbackConfig } from './feedbackConfig';

describe('parseFormbricksFeedbackConfig', () => {
  it('normalizes a complete HTTP configuration', () => {
    expect(parseFormbricksFeedbackConfig(' workspace-1 ', ' https://app.formbricks.com/ ')).toEqual(
      {
        workspaceId: 'workspace-1',
        appUrl: 'https://app.formbricks.com',
      },
    );
  });

  it('accepts an HTTP self-hosted URL', () => {
    expect(parseFormbricksFeedbackConfig('workspace-1', 'http://localhost:3000')).toEqual({
      workspaceId: 'workspace-1',
      appUrl: 'http://localhost:3000',
    });
  });

  it.each([
    [undefined, 'https://app.formbricks.com'],
    ['workspace-1', undefined],
    ['workspace-1', 'not a URL'],
    ['workspace-1', 'javascript:alert(1)'],
    ['workspace-1', 'https://user:password@app.formbricks.com'],
    ['workspace-1', 'https://app.formbricks.com?unexpected=true'],
  ])('disables feedback for an incomplete or unsafe configuration', (workspaceId, appUrl) => {
    expect(parseFormbricksFeedbackConfig(workspaceId, appUrl)).toBeNull();
  });
});
