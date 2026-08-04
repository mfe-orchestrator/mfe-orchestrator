/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Build identifier injected by vite, used to bust the cache of the assets loaded at runtime (translations) */
    readonly VITE_APP_BUILD_ID: string
}
