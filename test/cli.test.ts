import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/cli-core.ts'
import { vectors } from './vectors.ts'

describe('runCli', () => {
    it.each(vectors)('counts $name', ({ file, output }) => {
        const result = runCli(JSON.stringify(file))

        expect(result.exitCode).toBe(0)
        expect(JSON.parse(result.stdout)).toEqual(output)
        expect(result.stdout.endsWith('\n')).toBe(true)
    })

    it('reports invalid JSON with exit code 2', () => {
        expect(runCli('{')).toEqual({ stdout: '{"error":"This file isn\'t valid JSON."}\n', exitCode: 2 })
    })

    it('reports a file it cannot read with exit code 2', () => {
        const result = runCli('{"format":"other"}')

        expect(result.exitCode).toBe(2)
        expect(JSON.parse(result.stdout)).toEqual({ error: "The file: this isn't a lockpad ballot file." })
    })
})

describe('the built CLI', () => {
    it('counts a ballot file from stdin with the hashed bundle', () => {
        const [vector] = vectors
        const stdout = execFileSync('node', ['dist/cli.mjs'], {
            cwd: new URL('..', import.meta.url),
            input: JSON.stringify(vector!.file),
            encoding: 'utf8',
        })

        expect(JSON.parse(stdout)).toEqual(vector!.output)
        expect(readFileSync(new URL('../dist/cli.mjs', import.meta.url), 'utf8')).toMatch(/from ["']\.\/lockpad-count\.mjs["']/)
    })

    it('exits with code 2 on a bad file', () => {
        expect(() =>
            execFileSync('node', ['dist/cli.mjs'], { cwd: new URL('..', import.meta.url), input: '{', stdio: 'pipe' })
        ).toThrow(expect.objectContaining({ status: 2 }))
    })
})

describe('the built bundle', () => {
    it.each(vectors)('counts $name exactly as the source does', async ({ file, output }) => {
        const bundle = (await import(new URL('../dist/lockpad-count.mjs', import.meta.url).href)) as typeof import('../src/index.ts')

        expect(bundle.countFile(bundle.parseBallotFile(JSON.stringify(file)))).toEqual(output)
    })
})
