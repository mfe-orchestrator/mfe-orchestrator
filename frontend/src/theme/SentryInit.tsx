import * as Sentry from "@sentry/react";
import { useEffect } from "react";


const SentryInit : React.FC<React.PropsWithChildren>= ({children}) =>{

  useEffect(()=>{
    if(!window?.globalConfiguration?.SENTRY_DSN) {
        console.log("Sentry DSN not found");
        return
    }

    if(Sentry.isInitialized()) return;

      Sentry.init({
          dsn: window?.globalConfiguration?.SENTRY_DSN,
          // Setting this option to true will send default PII data to Sentry.
          // For example, automatic IP address collection on events
          enableLogs: true,
          enabled: true,
          sendDefaultPii: true,
          release: window?.globalConfiguration?.VERSION,
          environment: window?.globalConfiguration?.ENVIRONMENT,
          integrations: [
            Sentry.feedbackIntegration({
              colorScheme: "system",
              triggerLabel: "",
            }),
            Sentry.replayIntegration(),
            Sentry.browserTracingIntegration()
          ],
          tracePropagationTargets: ["localhost", /^https:\/\/console\.mfe-orchestrator\.dev\/api/],
          tracesSampleRate: 0.1,
          replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
          replaysOnErrorSampleRate: 0.5 // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
      });

      console.log("Sentry initialized");
  }, [window?.globalConfiguration?.SENTRY_DSN])

  return <>{children}</>
}


export default SentryInit