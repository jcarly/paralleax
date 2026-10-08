# ADR-028: Brevo HTTPS Transactional Email Delivery

Status: Accepted

Date: 2026-10-08

## Context

Account registration, verification, and password recovery require transactional
email delivery. The initial implementation used a provider-neutral SMTP URL and
Nodemailer, but the selected Railway deployment blocks outbound SMTP below its
Pro plan. Delivery therefore timed out before authentication even though normal
HTTPS traffic remained available.

Maintaining SMTP and a provider API as simultaneous configuration paths would
double the operational states, tests, and failure handling for one current
provider. Authentication features must also remain independent of the provider
client, and delivery failures must not expose recipients, message content, or
credentials.

## Decision

Replace the SMTP transport with Brevo's HTTPS transactional-email API. The API
application uses the official `@getbrevo/brevo` Node.js client behind the existing
application-owned `EmailService`; authentication services and templates continue
to depend only on that application boundary.

`BREVO_API_KEY` and `EMAIL_FROM` are required together. `EMAIL_REPLY_TO` remains
optional, and sender values are parsed and validated at application startup. The
legacy `EMAIL_SMTP_URL` setting is rejected explicitly so an outdated deployment
cannot silently disable account email.

The client uses a ten-second timeout and disables automatic retries for delivery
requests. An accepted send whose response is lost has an uncertain outcome, so a
transparent retry could create duplicate verification or recovery messages. The
existing test-only outbox remains unchanged.

Logs retain only allowlisted provider metadata: the HTTP status, provider error
code, provider request id, and a bounded error category. Raw responses, exception
messages, recipients, message content, and API credentials are never logged. The
public application failure remains `EMAIL_DELIVERY_UNAVAILABLE`.

## Consequences

- Transactional email uses ordinary HTTPS egress and no longer depends on hosting
  support for SMTP ports.
- Paralleax is operationally coupled to Brevo, but that dependency remains
  confined to the API email feature.
- Deployments must provision a Brevo API key rather than an SMTP key.
- SMTP and Brevo modes do not coexist, which keeps configuration fail-closed and
  avoids a second delivery workflow.
- The current SDK package and repository do not declare an explicit software
  license. This must be clarified before broader distribution; if Brevo does not
  provide suitable terms, the adapter must move to the documented HTTPS endpoint
  through Node's native `fetch` without changing the application boundary.
- No database or account-token migration is required.
