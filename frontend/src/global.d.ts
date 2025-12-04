
interface GlobalConfiguration {
  SENTRY_DSN?: string;
  VERSION?: string;
  ENVIRONMENT?: string;
}

declare global {
  interface Window {
    globalConfiguration: GlobalConfiguration;
  }
}