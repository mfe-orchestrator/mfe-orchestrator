import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
        // Every unit test here stubs what it needs: none of them talks to MongoDB, to
        // Redis or to an identity provider, so a missing service is a broken test, not
        // a skipped one.
        globals: false
    }
})
