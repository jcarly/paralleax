import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { authenticationPath } from '../../authNavigation';

export function StoryUnavailablePage({
  authenticated,
  returnTo,
  reason = 'inaccessible',
  storyId,
}: {
  authenticated: boolean;
  returnTo: string;
  reason?: 'inaccessible' | 'access-settings';
  storyId?: string;
}) {
  const { t } = useTranslation();
  const isAccessSettings = reason === 'access-settings';

  return (
    <main className="page story-unavailable" aria-labelledby="story-unavailable-title">
      <h1 id="story-unavailable-title">
        {t(isAccessSettings ? 'storyUnavailable.accessTitle' : 'storyUnavailable.title')}
      </h1>
      <p>
        {t(
          isAccessSettings ? 'storyUnavailable.accessDescription' : 'storyUnavailable.description',
        )}
      </p>
      <div className="actions">
        {storyId && isAccessSettings ? (
          <Link className="button secondary" to={`/stories/${storyId}/edit`}>
            {t('storyUnavailable.backToStory')}
          </Link>
        ) : null}
        <Link className="button secondary" to="/">
          {t('shell.stories')}
        </Link>
        {!authenticated ? (
          <Link className="button primary" to={authenticationPath('login', returnTo)}>
            {t('shell.signIn')}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
