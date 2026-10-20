import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
        // Every unit test here stubs what it needs: none of them talks to MongoDB, to
        // Redis or to an identity provider, so a missing service is a broken test, not
        // a skipped one.
        globals: false,
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.test.ts", "src/**/__fixtures__/**"],
            reporter: ["text-summary", "html", "json-summary"],
            // CI publishes the summary even when a test fails
            reportOnFailure: true
        }
    }
})
