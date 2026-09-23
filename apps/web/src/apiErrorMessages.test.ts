import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { apiErrorMessage } from './apiErrorMessages';
import { i18n } from './i18n';

describe('apiErrorMessage', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('uses the localized copy for a stable application error code', async () => {
    await i18n.changeLanguage('fr');

    expect(
      apiErrorMessage(
        new ApiError(
          'The collaborator must be an existing non-owner account',
          400,
          'COLLABORATOR_ACCOUNT_INVALID',
        ),
        i18n.t,
        'Impossible d’ajouter cet utilisateur',
      ),
    ).toBe('Ce compte n’existe pas ou est déjà propriétaire de l’histoire.');
  });

  it('does not expose the server message for a generic HTTP code', async () => {
    await i18n.changeLanguage('fr');

    expect(
      apiErrorMessage(
        new ApiError('Internal implementation detail', 403, 'FORBIDDEN'),
        i18n.t,
        'Échec de l’opération',
      ),
    ).toBe('Vous n’avez pas l’autorisation d’effectuer cette action.');
  });

  it('localizes comment deletion authorization failures', async () => {
    await i18n.changeLanguage('fr');

    expect(
      apiErrorMessage(
        new ApiError('Deleting this comment is not permitted', 403, 'COMMENT_DELETE_FORBIDDEN'),
        i18n.t,
        'Impossible de supprimer la discussion',
      ),
    ).toBe('Vous ne pouvez pas supprimer cette discussion.');
  });

  it('keeps a future explicit application message as a compatibility fallback', () => {
    expect(
      apiErrorMessage(
        new ApiError('A precise future error', 422, 'FUTURE_APPLICATION_ERROR'),
        i18n.t,
        'Operation failed',
      ),
    ).toBe('A precise future error');
  });

  it('preserves local diagnostics but hides generated HTTP failure details', () => {
    expect(apiErrorMessage(new Error('local detail'), i18n.t, 'Operation failed')).toBe(
      'local detail',
    );
    expect(apiErrorMessage(new ApiError('server detail', 500, 'HTTP_500'), i18n.t, 'Failed')).toBe(
      'Failed',
    );
  });
});
