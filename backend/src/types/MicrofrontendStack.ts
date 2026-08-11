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
    WEBCOMPONENT = "WEBCOMPONENT"
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

const COMPILER_BY_NAME: Record<string, MicrofrontendCompiler> = {
    vite: MicrofrontendCompiler.VITE,
    webpack: MicrofrontendCompiler.WEBPACK,
    webcomponent: MicrofrontendCompiler.WEBCOMPONENT,
    webcomponents: MicrofrontendCompiler.WEBCOMPONENT,
    "web-component": MicrofrontendCompiler.WEBCOMPONENT
}

/**
 * The marketplace catalogue is fetched from a repository outside this codebase and spells its
 * values freely ("React", "vite", "webcomponent"), so both axes are normalised on the way in and
 * an unknown value becomes undefined rather than a wrong stack.
 */
export const parseFramework = (value?: string): MicrofrontendFramework | undefined => (value ? FRAMEWORK_BY_NAME[value.trim().toLowerCase()] : undefined)

export const parseCompiler = (value?: string): MicrofrontendCompiler | undefined => (value ? COMPILER_BY_NAME[value.trim().toLowerCase()] : undefined)

/** Module federation only applies to real bundlers: web components are wired up at runtime. */
export const supportsModuleFederation = (compiler?: MicrofrontendCompiler): boolean => compiler === MicrofrontendCompiler.VITE || compiler === MicrofrontendCompiler.WEBPACK
