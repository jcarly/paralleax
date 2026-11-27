import type { ImportIssue } from '@paralleax/shared';

/** A fixed-size preview, prioritizing blocking errors while preserving source order. */
export class ImportIssuePreview {
  private readonly issues: ImportIssue[] = [];

  capture = (issue: ImportIssue): void => {
    if (this.issues.length < 50) {
      this.issues.push(issue);
      return;
    }
    if (issue.severity === 'error') {
      const warningIndex = this.issues.findIndex((item) => item.severity === 'warning');
      if (warningIndex !== -1) {
        this.issues.splice(warningIndex, 1);
        this.issues.push(issue);
      }
    }
  };

  snapshot(): ImportIssue[] {
    return this.issues;
  }
}
