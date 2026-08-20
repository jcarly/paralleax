# Formbricks Contextual Feedback

Status: Optional operator integration

Paralleax exposes a compact `Give feedback` / `Donner un retour` button in the
application header when Formbricks is configured. The integration is entirely in
the web layer: it does not change authored stories, reader progress, the API, or
the database.

## Formbricks setup

1. Create or select a Formbricks Workspace.
2. Create a Website & App Survey. The Formbricks `Feedback Box` template is a
   suitable starting point.
3. Add a code action named exactly `paralleax_feedback_opened`.
4. Use that action as the survey trigger.
5. Add these hidden fields to the survey:
   - `paralleax_route`
   - `paralleax_surface`
   - `paralleax_version`
   - `paralleax_viewport`
   - `paralleax_language`
6. Configure the recontact behavior so the same visitor can deliberately open
   the feedback box more than once. During testing, remove or shorten the
   Workspace cooldown that would otherwise suppress repeated displays.
7. Add English and French survey translations if both Paralleax interface
   languages are in use.

The code action and hidden-field names are an integration contract. Changing
them in Formbricks without changing Paralleax prevents the survey trigger or its
context from working.

## Application configuration

Both variables are required. Leaving either one empty keeps the SDK and button
disabled:

```dotenv
VITE_FORMBRICKS_WORKSPACE_ID=<workspace-id>
VITE_FORMBRICKS_APP_URL=https://app.formbricks.com
```

For a self-hosted multi-domain Formbricks installation, use its `PUBLIC_URL` as
the app URL. For a single-domain installation, use its `WEBAPP_URL`.

These are public web-build settings, not secrets. Vite embeds them into the
browser bundle. A production Docker image must therefore receive them while it
is built:

```bash
docker build --target web \
  --build-arg VITE_FORMBRICKS_WORKSPACE_ID=<workspace-id> \
  --build-arg VITE_FORMBRICKS_APP_URL=https://app.formbricks.com \
  --tag paralleax-web:<commit> .
```

The production Nginx configuration also adds the configured app URL to
`script-src` and `connect-src`. Docker Compose passes the same value at build
and runtime. Other deployment systems must keep those values identical so the
browser Content Security Policy does not block the SDK or its requests.

## Feedback context and privacy

When the button is clicked, Paralleax sends the following hidden fields with the
Formbricks action:

- a normalized route such as `/stories/:storyId/edit`;
- the product surface, such as `editor` or `player`;
- the Paralleax web package version;
- viewport width and height;
- the current interface language.

Paralleax does not call Formbricks user identification APIs. It does not send an
account id, email address, story title, interaction text, or other authored
content. Formbricks itself records standard response metadata, including the
current full URL, browser, operating system, device, and country. The full URL
can contain a story id even though Paralleax's custom route field is normalized.
Review this metadata, the survey questions, access controls, retention, and
hosting location before inviting real testers.

## Verification

After publishing the survey and deploying a configured web build:

1. Open the story library, an editor, and a player route.
2. Confirm the localized feedback button appears in each application header.
3. Click it and confirm the survey opens every time permitted by the recontact
   and cooldown settings.
4. Submit a test response and verify all five hidden fields.
5. Confirm no account identity or authored story content appears in the
   Formbricks response.
