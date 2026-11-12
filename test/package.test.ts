import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from '../src/version.ts'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string
    license: string
    dependencies?: Record<string, string>
    devDependencies: Record<string, string>
}

describe('package.json', () => {
    it('has no runtime dependencies', () => {
        expect(Object.keys(manifest.dependencies ?? {})).toEqual([])
    })

    it('pins every dev dependency exactly', () => {
        for (const version of Object.values(manifest.devDependencies)) {
            expect(version).toMatch(/^\d+\.\d+\.\d+$/)
        }
    })

    it('matches the engine version', () => {
        expect(manifest.version).toBe(ENGINE_VERSION)
    })

    it('is MIT licensed', () => {
        expect(manifest.license).toBe('MIT')
    })
})
