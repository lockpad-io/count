import { describe, expect, it } from 'vitest'
import { countPlurality } from '../src/plurality.ts'
import type { ElectionQuestion, TieDecision } from '../src/types.ts'

const [A, B, C, D] = [0, 1, 2, 3]

function times(n: number, ballot: number[]): number[][] {
    return Array.from({ length: n }, () => [...ballot])
}

function question(ballots: number[][], overrides: Partial<ElectionQuestion> = {}): ElectionQuestion {
    return {
        id: 'q1',
        kind: 'election',
        title: 'Committee',
        method: 'plurality',
        seats: 2,
        candidates: ['A', 'B', 'C', 'D'],
        minPreferences: 1,
        ballots,
        tieDecisions: [],
        ...overrides,
    }
}

const elect = (tied: number[], chosen: number): TieDecision => ({ round: 1, kind: 'elect', tied, chosen, how: 'entered' })

describe('countPlurality', () => {
    it('elects the candidates with the most marks', () => {
        const result = countPlurality(question([...times(3, [A, B]), ...times(2, [A, C]), [B, D], [C]]))

        expect(result).toEqual({
            kind: 'election',
            questionId: 'q1',
            method: 'plurality',
            status: 'complete',
            formal: 7,
            informal: 0,
            elected: [A, B],
            rounds: [
                {
                    number: 1,
                    action: { type: 'first-count' },
                    tallies: ['5.000000', '4.000000', '3.000000', '1.000000'],
                    exhausted: '0.000000',
                    lostToRounding: '0.000000',
                    elected: [A, B],
                    excluded: [],
                    ties: [],
                },
            ],
        })
    })

    it('counts informal ballots separately', () => {
        const result = countPlurality(question([[A, B], [A, B, C], [], [A, A], [9]]))

        expect(result.formal).toBe(1)
        expect(result.informal).toBe(4)
        expect(result.rounds[0]!.tallies).toEqual(['1.000000', '1.000000', '0.000000', '0.000000'])
    })

    it('elects the clear leaders when a tie is above the boundary', () => {
        // A and B are level at the top; both are elected without a decision.
        const result = countPlurality(question([...times(2, [A, B]), [C]]))

        expect(result.status).toBe('complete')
        expect(result.elected).toEqual([A, B])
        expect(result.rounds[0]!.ties).toEqual([])
    })

    describe('a tie at the boundary', () => {
        const ballots = [...times(2, [A, B]), ...times(2, [A, C])]

        it('is unresolved without a decision', () => {
            const result = countPlurality(question(ballots))

            expect(result.status).toBe('tie-unresolved')
            expect(result.unresolvedTie).toEqual({ round: 1, kind: 'elect', tied: [B, C] })
            expect(result.elected).toEqual([A])
        })

        it('is settled by a decision', () => {
            const result = countPlurality(question(ballots, { tieDecisions: [elect([B, C], C)] }))

            expect(result.status).toBe('complete')
            expect(result.elected).toEqual([A, C])
            expect(result.unresolvedTie).toBeUndefined()
            expect(result.rounds[0]!.ties).toEqual([{ kind: 'elect', tied: [B, C], chosen: C, by: 'decision' }])
        })

        it('ignores a decision for a different tie', () => {
            const result = countPlurality(question(ballots, { tieDecisions: [elect([B, D], B)] }))

            expect(result.status).toBe('tie-unresolved')
        })
    })

    describe('a three-way tie for two seats', () => {
        const ballots = [[A], [B], [C]]

        it('needs a second decision over the remaining two', () => {
            const result = countPlurality(
                question(ballots, { candidates: ['A', 'B', 'C'], tieDecisions: [elect([A, B, C], B), elect([A, C], C)] })
            )

            expect(result.status).toBe('complete')
            expect(result.elected).toEqual([B, C])
            expect(result.rounds[0]!.ties).toEqual([
                { kind: 'elect', tied: [A, B, C], chosen: B, by: 'decision' },
                { kind: 'elect', tied: [A, C], chosen: C, by: 'decision' },
            ])
        })

        it('is unresolved with only one decision', () => {
            const result = countPlurality(
                question(ballots, { candidates: ['A', 'B', 'C'], tieDecisions: [elect([A, B, C], B)] })
            )

            expect(result.status).toBe('tie-unresolved')
            expect(result.unresolvedTie).toEqual({ round: 1, kind: 'elect', tied: [A, C] })
            expect(result.elected).toEqual([B])
        })
    })

    it('elects every candidate of an uncontested election, even with no ballots', () => {
        const result = countPlurality(question([], { candidates: ['A', 'B'] }))

        expect(result.status).toBe('complete')
        expect(result.formal).toBe(0)
        expect(result.elected).toEqual([A, B])
    })

    it('orders an uncontested election by tally, then by candidate order', () => {
        const result = countPlurality(question([[C], [B]], { candidates: ['A', 'B', 'C'], seats: 3 }))

        expect(result.elected).toEqual([B, C, A])
        expect(result.rounds[0]!.ties).toEqual([])
    })

    it('handles a very long list of candidates', () => {
        const candidates = Array.from({ length: 200_000 }, (_, i) => `C${i}`)

        expect(countPlurality(question([[0]], { candidates, seats: 200_000 })).elected).toHaveLength(200_000)
    })

    it('elects nobody when no ballot is formal', () => {
        const result = countPlurality(question([[], [A, B, C], [7]]))

        expect(result.status).toBe('complete')
        expect(result.formal).toBe(0)
        expect(result.informal).toBe(3)
        expect(result.elected).toEqual([])
        expect(result.rounds).toHaveLength(1)
        expect(result.rounds[0]!.tallies).toEqual(['0.000000', '0.000000', '0.000000', '0.000000'])
    })
})
