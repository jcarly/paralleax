import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { reportBrowserError } from '../observability/browserMonitoring';
import { useRouteError } from 'react-router-dom';

export function isDynamicImportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('importing a module script failed') ||
    /loading (?:css )?chunk .+ failed/i.test(message)
  );
}

export function RouteErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  const isLoadFailure = isDynamicImportError(error);
  const reportedError = useRef<unknown>(null);

  useEffect(() => {
    if (!(error instanceof Error) || reportedError.current === error) return;
    reportedError.current = error;
    reportBrowserError(error, isLoadFailure ? 'dynamic-import' : 'route-error');
  }, [error, isLoadFailure]);

  return (
    <main className="page" role="main">
      <section className="story-unavailable" aria-labelledby="route-error-title">
        <h1 id="route-error-title">
          {t(isLoadFailure ? 'routeError.loadTitle' : 'routeError.unexpectedTitle')}
        </h1>
        <p>
          {t(isLoadFailure ? 'routeError.loadDescription' : 'routeError.unexpectedDescription')}
        </p>
        <p>{t('routeError.unsavedWarning')}</p>
        <a className="product-primary" href={window.location.href}>
          {t('routeError.reload')}
        </a>
      </section>
    </main>
  );
}
