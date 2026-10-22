/**
 * The stack a microfrontend is built with, the two axes the integration instructions depend on.
 *
 * They mirror what the marketplace templates declare (`framework` and `compiler`), because a
 * microfrontend created from a template already knows its stack and should never be asked again.
 */

export enum MicrofrontendFramework {
    REACT = "REACT",
    VUE = "VUE",
    ANGULAR = "ANGULAR"
}

export enum MicrofrontendCompiler {
    VITE = "VITE",
    WEBPACK = "WEBPACK",
    /**
     * Not a bundler: web component microfrontends are plain scripts registering a custom element,
     * so they are integrated at runtime by the host instead of through module federation.
     */
    WEBCOMPONENT = "WEBCOMPONENT",
    /**
     * Not a bundler either, an integration model: a single-spa root config registers applications
     * that are native ES modules exporting lifecycles, imports them at runtime from `remoteUrl()`
     * and shares React through an import map. The templates build with Vite, but no module
     * federation is involved.
     */
    SINGLE_SPA = "SINGLE_SPA",
    /**
     * An integration model too: a micro-lc shell mounts parcels, UMD scripts exporting lifecycles,
     * from a configuration built at runtime with `remoteUrl()`, and shares React through
     * `window.React`, `window.ReactDOM` and `window.ReactJSXRuntime`. Built with Vite, never federated.
     */
    MICRO_LC = "MICRO_LC"
}

export enum MicrofrontendStackSource {
    /** Declared by the marketplace template the repository was created from */
    TEMPLATE = "TEMPLATE",
    /** Read out of the repository */
    DETECTED = "DETECTED",
    /** Chosen by the user, and never overwritten by detection */
    MANUAL = "MANUAL"
}

export interface MicrofrontendStackDTO {
    framework?: MicrofrontendFramework
    compiler?: MicrofrontendCompiler
    source: MicrofrontendStackSource
    detectedAt?: Date
}

const FRAMEWORK_BY_NAME: Record<string, MicrofrontendFramework> = {
    react: MicrofrontendFramework.REACT,
    vue: MicrofrontendFramework.VUE,
    angular: MicrofrontendFramework.ANGULAR
}

/** Keyed by the normalised spelling: lowercase, without dashes, underscores or spaces */
const COMPILER_BY_NAME: Record<string, MicrofrontendCompiler> = {
    vite: MicrofrontendCompiler.VITE,
    webpack: MicrofrontendCompiler.WEBPACK,
    webcomponent: MicrofrontendCompiler.WEBCOMPONENT,
    webcomponents: MicrofrontendCompiler.WEBCOMPONENT,
    singlespa: MicrofrontendCompiler.SINGLE_SPA,
    microlc: MicrofrontendCompiler.MICRO_LC
}

/**
 * The marketplace catalogue is fetched from a repository outside this codebase and spells its
 * values freely ("React", "vite", "webcomponent"), so both axes are normalised on the way in and
 * an unknown value becomes undefined rather than a wrong stack.
 */
export const parseFramework = (value?: string): MicrofrontendFramework | undefined => (value ? FRAMEWORK_BY_NAME[value.trim().toLowerCase()] : undefined)

const compilerKey = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/[-_\s]/g, "")

export const parseCompiler = (value?: string): MicrofrontendCompiler | undefined => (value ? COMPILER_BY_NAME[compilerKey(value)] : undefined)

/** Module federation only applies to real bundlers: web components, single-spa and micro-lc are wired up at runtime. */
export const supportsModuleFederation = (compiler?: MicrofrontendCompiler): boolean => compiler === MicrofrontendCompiler.VITE || compiler === MicrofrontendCompiler.WEBPACK

/**
 * Integration models whose host is wired up by a file the console generates (the single-spa
 * applications, the micro-lc configuration) rather than by a bundler config.
 */
export const isIntegrationModel = (compiler?: MicrofrontendCompiler): boolean => compiler === MicrofrontendCompiler.SINGLE_SPA || compiler === MicrofrontendCompiler.MICRO_LC
