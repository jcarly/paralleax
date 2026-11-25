def valid_origin:
  test("^https?://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?$") and
  (contains("..") | not) and
  (capture("^https?://(?<host>[^:]+)(:(?<port>[0-9]+))?$") |
    (.host | split(".") | all(test("^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$"))) and
    (.port == null or ((.port | tonumber) > 0 and (.port | tonumber) <= 65535)));
def dsn:
  select(test("^https?://[A-Za-z0-9_-]+@[A-Za-z0-9.:-]+/[A-Za-z0-9_/-]+$")) |
  capture("^(?<scheme>https?)://(?<key>[A-Za-z0-9_-]+)@(?<host>[A-Za-z0-9.:-]+)/(?<path>[A-Za-z0-9_/-]+)$") |
  select((.scheme + "://" + .host) | valid_origin) |
  select(.key | test("^(phx_|sntrys_|sntryu_)") | not) |
  select(.path | test("[A-Za-z0-9_]")) |
  .scheme + "://" + .key + "@" + .host + "/" + .path;
def safe_string: select(test("^[A-Za-z0-9._/-]{1,200}$") and (test("^(phx_|sntrys_|sntryu_)") | not));
(env.VITE_SENTRY_DSN // "" | [dsn] | .[0]) as $dsn |
(env.VITE_POSTHOG_PROJECT_TOKEN // "" | [select(test("^phc_[A-Za-z0-9_-]+$"))] | .[0]) as $token |
(env.VITE_POSTHOG_API_HOST // "" | sub("/$"; "") | [select(valid_origin)] | .[0]) as $host |
(env.VITE_POSTHOG_FEEDBACK_SURVEY_ID // "" | [select(test("^[A-Za-z0-9-]+$"))] | .[0]) as $survey |
{ sentryDsn: $dsn, sentryRelease: ($image_release | [safe_string] | .[0]),
  sentryTracesSampleRate: (env.VITE_SENTRY_TRACES_SAMPLE_RATE // "" | [select(test("^(0(\\.[0-9]+)?|1(\\.0+)?)$"))] | .[0]),
  posthogProjectToken: $token, posthogApiHost: $host, posthogFeedbackSurveyId: $survey }
