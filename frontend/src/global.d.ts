interface GlobalConfiguration {
  SENTRY_DSN?: string;
}

declare global {
  interface Window {
    globalConfiguration: GlobalConfiguration;
  }
}
