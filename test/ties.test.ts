import { describe, expect, it } from 'vitest'
import { SCALE } from '../src/fixed.ts'
import { breakTie, findDecision } from '../src/ties.ts'
import type { TieDecision } from '../src/types.ts'

const votes = (...tallies: number[]) => tallies.map(t => BigInt(t) * SCALE)

describe('breakTie', () => {
    it('keeps the lowest at the latest round where the tied candidates differ', () => {
        expect(breakTie([1, 2], [votes(6, 5, 3, 2)], true)).toEqual([2])
    })

    it('keeps the highest when asked', () => {
        expect(breakTie([1, 2], [votes(6, 5, 3, 2)], false)).toEqual([1])
    })

    it('looks back past rounds where the tied candidates were level', () => {
        expect(breakTie([0, 1], [votes(4, 2), votes(3, 3)], true)).toEqual([1])
    })

    it('uses the most recent differing round, not the first', () => {
        expect(breakTie([0, 1], [votes(1, 2), votes(3, 2)], true)).toEqual([1])
    })

    it('returns the whole tie when every round was level', () => {
        expect(breakTie([1, 2], [votes(9, 4, 4), votes(9, 4, 4)], true)).toEqual([1, 2])
    })

    it('returns the whole tie with no earlier rounds', () => {
        expect(breakTie([0, 2], [], true)).toEqual([0, 2])
    })

    it('keeps narrowing among those still tied', () => {
        // Round 2 leaves 1 and 3 level at the bottom; round 1 separates them.
        const history = [votes(9, 2, 5, 3), votes(9, 4, 6, 4)]

        expect(breakTie([1, 2, 3], history, true)).toEqual([1])
    })

    it('reports a partly broken tie', () => {
        expect(breakTie([0, 1, 2], [votes(3, 3, 5)], true)).toEqual([0, 1])
    })
})

describe('findDecision', () => {
    const decisions: TieDecision[] = [
        { round: 2, kind: 'exclude', tied: [1, 2], chosen: 2, how: 'entered' },
        { round: 3, kind: 'elect', tied: [0, 1, 2], chosen: 0, how: 'entered' },
    ]

    it('finds the decision for this round, kind and tie', () => {
        expect(findDecision(decisions, 2, 'exclude', [1, 2])).toBe(decisions[0])
        expect(findDecision(decisions, 3, 'elect', [0, 1, 2])).toBe(decisions[1])
    })

    it('ignores a decision for another round, kind or tie', () => {
        expect(findDecision(decisions, 3, 'exclude', [1, 2])).toBeUndefined()
        expect(findDecision(decisions, 2, 'elect', [1, 2])).toBeUndefined()
        expect(findDecision(decisions, 2, 'exclude', [1, 3])).toBeUndefined()
        expect(findDecision(decisions, 2, 'exclude', [1, 2, 3])).toBeUndefined()
    })
})
