# ADR-016: Client-Side Interface Internationalization

Status: Accepted

Date: 2026-08-13

## Context

Paralleax needs an interface that can be used in more than one language without
turning authored narrative content into localization data. Labels, controls,
status messages, accessibility names, and reader diagnostics are product copy;
story titles, interaction bodies, and entity names and descriptions belong to
the author.

The first supported interface languages are English and French. The app must be
usable immediately without a translation service or another startup request,
and a language choice must survive navigation and later browser sessions.

## Decision

The React application uses `i18next` with `react-i18next`. Versioned English and
French resources are bundled in `apps/web/src/i18n/`, English is the fallback,
and product components resolve copy through translation keys.

At startup, the web app selects the first valid source in this order:

1. the explicit preference in browser local storage;
2. a supported language from the browser language list;
3. English.

Changing the language updates the HTML `lang` attribute and local preference.
It does not update a user, Story, reader-progress, or API record.

Only interface copy is translated. Authored values are interpolated into
localized interface sentences but are never passed through translation lookup
or rewritten. The API and shared narrative engine remain language-independent.

## Consequences

- Authentication, library, authoring, simulation, and reader surfaces can
  switch between English and French without a page reload.
- Translation resources are available offline with the deployed web bundle and
  introduce no translation-service availability or privacy dependency.
- Dates, numbers, and plurals follow the selected interface language where they
  are rendered as product metadata.
- New product copy should be added to both resource sets and rendered through
  `react-i18next`; tests run in English unless a localization behavior is under
  test.
- Adding languages increases the web bundle and requires translation review.
- Local storage means the preference is browser-specific rather than synced
  across a user's devices. Account-level language may be added later without
  changing story semantics.
