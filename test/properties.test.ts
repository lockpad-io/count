import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { countQuestion } from '../src/count.ts'
import type { ElectionResult } from '../src/results.ts'
import { countStvWigm } from '../src/stv-wigm.ts'
import type { ElectionQuestion, Method } from '../src/types.ts'

const settings = { seed: 20261030, numRuns: 500 }

/** An election with 1–6 candidates and up to 40 ballots, some of them informal. */
const elections = (methods: Method[] = ['plurality', 'irv', 'stv-wigm']) =>
    fc
        .record({
            method: fc.constantFrom(...methods),
            candidateCount: fc.integer({ min: 1, max: 6 }),
            seats: fc.integer({ min: 1, max: 3 }),
        })
        .chain(({ method, candidateCount, seats }) =>
            fc.record({
                method: fc.constant(method),
                candidateCount: fc.constant(candidateCount),
                seats: fc.constant(method === 'irv' ? 1 : seats),
                ballots: fc.array(
                    fc.uniqueArray(fc.integer({ min: 0, max: candidateCount - 1 }), { maxLength: candidateCount }),
                    { maxLength: 40 }
                ),
            })
        )
        .map(
            ({ method, candidateCount, seats, ballots }): ElectionQuestion => ({
                id: 'q1',
                kind: 'election',
                title: 'Property',
                method,
                seats,
                candidates: Array.from({ length: candidateCount }, (_, i) => `C${i}`),
                minPreferences: 1,
                ballots,
                tieDecisions: [],
            })
        )

const millionths = (s: string) => BigInt(s.replace('.', ''))

describe('properties', () => {
    it('elects a lone candidate', () => {
        fc.assert(
            fc.property(elections(), q => {
                const lone = { ...q, seats: 1, candidates: ['Only'], ballots: q.ballots.map(b => b.filter(c => c === 0)) }
                const result = countQuestion(lone) as ElectionResult

                expect(result.elected).toEqual([0])
                expect(result.status).toBe('complete')
            }),
            settings
        )
    })

    it('elects the unanimous first preference by instant runoff', () => {
        fc.assert(
            fc.property(elections(['irv']), fc.nat(), (q, pick) => {
                const winner = pick % q.candidates.length
                const ballots = [[winner], ...q.ballots.map(b => [winner, ...b.filter(c => c !== winner)])]
                const result = countQuestion({ ...q, ballots }) as ElectionResult

                expect(result.elected).toEqual([winner])
            }),
            settings
        )
    })

    it('keeps every STV vote accounted for in every round', () => {
        fc.assert(
            fc.property(elections(['stv-wigm']), q => {
                const result = countStvWigm(q)
                for (const round of result.rounds) {
                    const sum = [...round.tallies, round.exhausted, round.lostToRounding].reduce(
                        (total, s) => total + millionths(s),
                        0n
                    )
                    expect(sum).toBe(BigInt(result.formal) * 1_000_000n)
                }
            }),
            settings
        )
    })

    it('never depends on the order of the ballots', () => {
        fc.assert(
            fc.property(
                elections().chain(q =>
                    fc
                        .shuffledSubarray(q.ballots, { minLength: q.ballots.length, maxLength: q.ballots.length })
                        .map(shuffled => [q, { ...q, ballots: shuffled }] as const)
                ),
                ([q, shuffled]) => {
                    expect(countQuestion(shuffled)).toEqual(countQuestion(q))
                }
            ),
            settings
        )
    })
})
