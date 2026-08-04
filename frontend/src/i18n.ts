import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import Backend from "i18next-http-backend"
import { initReactI18next } from "react-i18next"

i18n.use(Backend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        fallbackLng: "en",
        supportedLngs: ["it", "en"],
        debug: process.env.NODE_ENV === "development",
        ns: ["platform"],
        defaultNS: "platform",
        saveMissing: process.env.NODE_ENV === "development",
        backend: {
            loadPath: "/locales/{{lng}}/{{ns}}.json",
            // Cache busting: the translations are fetched at runtime, so without a version
            // the browser keeps serving the json of the previous release
            queryStringParams: { v: window?.globalConfiguration?.VERSION || import.meta.env.VITE_APP_BUILD_ID }
        },
        interpolation: {
            escapeValue: false // React already escapes values
        },
        react: {
            useSuspense: true
        }
    })
    .then(() => {
        console.log("i18n initialized with success", i18n)
    })
    .catch(error => {
        console.error("i18n initialization failed", error)
    })

i18n.on("missingKey", (lngs, ns, key) => {
    console.log("[Missing key]", { lngs, ns, key })
})
export default i18n
