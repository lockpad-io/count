import { expect, it, vi } from 'vitest'
import { runCli } from '../src/cli-core.ts'
import { vectors } from './vectors.ts'

vi.mock('../src/count.ts', () => ({
    countFile: () => {
        throw new TypeError('a bug in the engine')
    },
}))

it('lets an engine fault through, so it is never reported as a problem with the file', () => {
    expect(() => runCli(JSON.stringify(vectors[0]!.file))).toThrow(TypeError)
})
