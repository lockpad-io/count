import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        // Timing is checked on its own (npm run test:perf), where coverage can't slow it down.
        exclude: ['test/perf.test.ts'],
        // Builds dist/ once, so the CLI test runs the real bundle on a clean checkout.
        globalSetup: ['test/global-setup.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/cli.ts'],
            thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
        },
    },
})
