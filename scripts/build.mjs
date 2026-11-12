// Builds dist/: the library as one readable ESM file, the CLI shim that imports it, type
// declarations, and BUNDLE-SHA256, the hash of exactly the file the server and browsers run.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { build } from 'esbuild'

const root = new URL('..', import.meta.url).pathname
process.chdir(root)
rmSync('dist', { recursive: true, force: true })

const banner = '// @lockpad/count (MIT, Copyright (c) 2026 Skylake Digital Pty Ltd). See README.md and METHODS.md.'

await build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/lockpad-count.mjs',
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    minify: false,
    legalComments: 'none',
    banner: { js: banner },
})

await build({
    entryPoints: ['src/cli.ts'],
    outfile: 'dist/cli.mjs',
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    minify: false,
    banner: { js: '#!/usr/bin/env node' },
    plugins: [
        {
            name: 'hashed-library',
            setup(esbuild) {
                // The CLI runs the hashed bundle itself, never a second copy of the engine.
                esbuild.onResolve({ filter: /^\.\/index\.ts$/ }, () => ({ path: './lockpad-count.mjs', external: true }))
            },
        },
    ],
})

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' })

const hash = createHash('sha256').update(readFileSync('dist/lockpad-count.mjs')).digest('hex')
writeFileSync('dist/BUNDLE-SHA256', `${hash}\n`)
console.log(`dist/lockpad-count.mjs ${hash}`)
