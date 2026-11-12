import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { drawCandidate } from '../src/draw.ts'

function expectedDraw(seed: string, tied: number[]): number {
    const hex = createHash('sha256').update(seed, 'utf8').digest('hex')

    return tied[Number(BigInt(`0x${hex}`) % BigInt(tied.length))]!
}

describe('drawCandidate', () => {
    it('picks from the SHA-256 of the joined seed, modulo the tie size', () => {
        expect(drawCandidate('h', 'q1', 2, 'exclude', 'kookaburra', [1, 3, 4])).toBe(
            expectedDraw('h\nq1\n2\nexclude\n1,3,4\nkookaburra', [1, 3, 4])
        )
    })

    it('ignores ASCII whitespace around the witness value', () => {
        expect(drawCandidate('h', 'q1', 2, 'exclude', ' \tkookaburra\r\n', [1, 3, 4])).toBe(
            drawCandidate('h', 'q1', 2, 'exclude', 'kookaburra', [1, 3, 4])
        )
    })

    it('normalises the witness value to NFC', () => {
        expect(drawCandidate('h', 'q1', 2, 'exclude', 'Café', [1, 3, 4])).toBe(
            expectedDraw('h\nq1\n2\nexclude\nCafé', [1, 3, 4])
        )
    })

    it('normalises the question id to NFC', () => {
        expect(drawCandidate('h', 'Cafe\u0301', 2, 'exclude', 'kookaburra', [1, 3, 4])).toBe(
            expectedDraw('h\nCaf\u00e9\n2\nexclude\n1,3,4\nkookaburra', [1, 3, 4])
        )
    })

    it('varies with the round and kind', () => {
        const tied = [0, 1, 2, 3, 4, 5, 6]
        const byRound = new Set(
            Array.from({ length: 20 }, (_, round) => drawCandidate('h', 'q1', round + 1, 'exclude', 'kookaburra', tied))
        )
        const byKind = new Set(
            (['exclude', 'surplus-order', 'elect'] as const).flatMap(kind =>
                Array.from({ length: 5 }, (_, round) => drawCandidate('h', 'q1', round + 1, kind, 'kookaburra', tied))
            )
        )

        expect(byRound.size).toBeGreaterThan(1)
        expect(byKind.size).toBeGreaterThan(1)
    })

    it('gives every candidate a fair chance when one tie needs several draws in a row', () => {
        // Four tied for three seats: three draws in one round, each over the shrinking tie, all
        // from one witness value. Each candidate should miss out a quarter of the time.
        const missedOut = [0, 0, 0, 0]
        const trials = 2000
        for (let trial = 0; trial < trials; trial++) {
            let tied = [0, 1, 2, 3]
            while (tied.length > 1) {
                const chosen = drawCandidate('h', 'q1', 1, 'elect', `value ${trial}`, tied)
                tied = tied.filter(c => c !== chosen)
            }
            missedOut[tied[0]!]!++
        }

        for (const count of missedOut) {
            expect(count / trials).toBeGreaterThan(0.21)
            expect(count / trials).toBeLessThan(0.29)
        }
    })

    it('refuses an empty witness value', () => {
        expect(() => drawCandidate('h', 'q1', 2, 'exclude', ' \t ', [1, 3])).toThrow(/witness value/)
    })

    it('refuses a draw among fewer than two', () => {
        expect(() => drawCandidate('h', 'q1', 2, 'exclude', 'kookaburra', [1])).toThrow(/at least two/)
    })
})
