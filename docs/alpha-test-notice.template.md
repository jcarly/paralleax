# Private Alpha Test Notice Template

Status: Operator template — complete and review before use

This is a product-operations template, not finalized legal advice. Replace every
bracketed field and obtain appropriate legal review for the operator's country,
hosting location, and invited testers.

## Operator And Contact

- Service operator: `[operator legal name]`
- Contact for support, privacy, export, or deletion: `[contact address]`
- Hosting region and providers: `[region and provider names]`
- Alpha start and planned review date: `[dates]`

## Purpose And Access

Paralleax is an experimental tool for creating and testing interactive stories.
This private alpha is available only to invited testers. Accounts and stories
are private to their creator; there is no public publication or anonymous reader
access in this alpha.

Do not enter highly sensitive, illegal, confidential, or irreplaceable content.
Features and stored formats may change during testing. The operator may suspend
the alpha to protect data or correct a serious defect.

## Data Stored

The service stores:

- the account email address;
- a derived password hash, never the original password;
- revocable session records;
- authored stories, characters, locations, stats, items, images referenced by
  URL, and graph structure;
- reader progress and simulation-related authored changes;
- operational request identifiers, timestamps, status codes, and error details
  that exclude request bodies, passwords, cookies, and session tokens.

State the exact monitoring and error-reporting providers here: `[providers]`.

## Retention And Tester Requests

Alpha account and story data is retained for `[retention period]` or until the
tester requests deletion, subject to the documented backup-retention window of
`[backup deletion window]`.

Until self-service tools exist, testers can contact `[contact address]` to:

- request a copy of their account and story data;
- correct their account email address;
- revoke active sessions;
- delete their account, stories, and reader progress;
- report a suspected security or privacy incident.

Describe the operator response target and identity-verification procedure:
`[procedure]`.

## Backups And Incidents

Production data is backed up `[schedule]`, encrypted `[method]`, retained
`[retention]`, and restoration is tested `[frequency]`. A deletion request must
state when encrypted backup copies expire.

The operator will notify affected testers through `[incident channel]` when an
incident materially affects their data, subject to applicable law.

## Feedback

Testers may send product feedback through `[feedback channel]`. State whether
feedback may be quoted, attributed, or used anonymously: `[terms]`.

## Acknowledgement

Before creating an account, the tester should confirm that they received this
notice, understand the experimental nature of the alpha, and know how to contact
the operator.
