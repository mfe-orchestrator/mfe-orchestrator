import * as Sentry from "@sentry/react";
import { useEffect } from "react";


const SentryInit : React.FC<React.PropsWithChildren>= ({children}) =>{

  useEffect(()=>{
    if(!window.globalConfiguration.SENTRY_DSN) return
    
      Sentry.init({
          dsn: window.globalConfiguration.SENTRY_DSN,
          // Setting this option to true will send default PII data to Sentry.
          // For example, automatic IP address collection on events
          sendDefaultPii: true
      });
  }, [window.globalConfiguration.SENTRY_DSN])

  return <>{children}</>
}


export default SentryInit