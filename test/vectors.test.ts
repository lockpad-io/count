import { describe, expect, it } from 'vitest'
import { countFile } from '../src/count.ts'
import { canonicalJson, parseBallotFile } from '../src/ballot-file.ts'
import { vectors } from './vectors.ts'

describe('vectors', () => {
    it('has the hand-checked and published vectors', () => {
        expect(vectors.length).toBeGreaterThanOrEqual(12)
    })

    it.each(vectors)('$name counts to its stored output', ({ file, output }) => {
        const parsed = parseBallotFile(JSON.stringify(file))

        expect(countFile(parsed)).toEqual(output)
    })

    it.each(vectors)('$name is stored in canonical form', ({ file }) => {
        expect(canonicalJson(parseBallotFile(JSON.stringify(file)))).toBe(JSON.stringify(file))
    })
})
