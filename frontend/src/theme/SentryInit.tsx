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
          environment: window?.globalConfiguration?.ENVIRONMENT
      });
      console.log("Sentry initialized");
  }, [window?.globalConfiguration?.SENTRY_DSN])

  return <>{children}</>
}


export default SentryInit