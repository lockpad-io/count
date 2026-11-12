import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { countIrv } from '../src/irv.ts'
import type { ElectionQuestion, TieDecision } from '../src/types.ts'

const [A, B, C, D, E] = [0, 1, 2, 3, 4]

function times(n: number, ballot: number[]): number[][] {
    return Array.from({ length: n }, () => [...ballot])
}

function question(ballots: number[][], overrides: Partial<ElectionQuestion> = {}): ElectionQuestion {
    return {
        id: 'q1',
        kind: 'election',
        title: 'President',
        method: 'irv',
        seats: 1,
        candidates: ['A', 'B', 'C', 'D'].slice(0, 1 + Math.max(...ballots.flat(), 2)),
        minPreferences: 1,
        ballots,
        tieDecisions: [],
        ...overrides,
    }
}

const units = (...tallies: number[]) => tallies.map(t => `${t}.000000`)

describe('countIrv', () => {
    it('transfers the lowest candidate until someone has a majority', () => {
        const result = countIrv(question([...times(4, [A, B, C]), ...times(3, [B, C, A]), ...times(2, [C, B, A])]))

        expect(result).toMatchObject({ status: 'complete', formal: 9, informal: 0, elected: [B] })
        expect(result.quota).toBeUndefined()
        expect(result.rounds).toEqual([
            {
                number: 1,
                action: { type: 'first-count' },
                tallies: units(4, 3, 2),
                exhausted: '0.000000',
                lostToRounding: '0.000000',
                elected: [],
                excluded: [],
                ties: [],
            },
            {
                number: 2,
                action: { type: 'exclude', candidates: [C] },
                tallies: units(4, 5, 0),
                exhausted: '0.000000',
                lostToRounding: '0.000000',
                elected: [B],
                excluded: [C],
                ties: [],
            },
        ])
    })

    it('exhausts ballots with no further preference', () => {
        const result = countIrv(question([...times(4, [A]), ...times(3, [B]), ...times(2, [C])]))

        expect(result.rounds[1]!.exhausted).toBe('2.000000')
        expect(result.rounds[1]!.tallies).toEqual(units(4, 3, 0))
        expect(result.elected).toEqual([A])
    })

    it('skips an excluded candidate when a ballot moves on', () => {
        const result = countIrv(
            question([...times(5, [A]), ...times(4, [B]), ...times(2, [C]), ...times(1, [D, C, B])], {
                candidates: ['A', 'B', 'C', 'D'],
            })
        )

        // D goes first, to C; then C goes, and D's ballot skips D for B. A and B are then level on
        // 5, and countback excludes B, who had 4 in round 2.
        expect(result.rounds.map(r => r.tallies)).toEqual([
            units(5, 4, 2, 1),
            units(5, 4, 3, 0),
            units(5, 5, 0, 0),
            units(5, 0, 0, 0),
        ])
        expect(result.rounds[2]!.exhausted).toBe('2.000000')
        expect(result.rounds[3]!.ties).toEqual([{ kind: 'exclude', tied: [A, B], chosen: B, by: 'countback' }])
        expect(result.rounds[3]!.exhausted).toBe('7.000000')
        expect(result.elected).toEqual([A])
    })

    it('breaks a tie for exclusion by countback', () => {
        const result = countIrv(
            question([...times(6, [A]), ...times(5, [B]), ...times(3, [C]), ...times(2, [D, C])], {
                candidates: ['A', 'B', 'C', 'D'],
            })
        )

        expect(result.rounds.map(r => r.tallies)).toEqual([units(6, 5, 3, 2), units(6, 5, 5, 0), units(6, 5, 0, 0)])
        expect(result.rounds[2]!.action).toEqual({ type: 'exclude', candidates: [C] })
        expect(result.rounds[2]!.ties).toEqual([{ kind: 'exclude', tied: [B, C], chosen: C, by: 'countback' }])
        expect(result.rounds[2]!.exhausted).toBe('5.000000')
        expect(result.elected).toEqual([A])
    })

    describe('a tie countback cannot break', () => {
        const ballots = [...times(3, [A]), ...times(2, [B]), ...times(2, [C])]

        it('is unresolved without a decision', () => {
            const result = countIrv(question(ballots))

            expect(result.status).toBe('tie-unresolved')
            expect(result.unresolvedTie).toEqual({ round: 2, kind: 'exclude', tied: [B, C] })
            expect(result.elected).toEqual([])
            expect(result.rounds).toHaveLength(1)
        })

        it('is settled by a decision for the round that excludes', () => {
            const decision: TieDecision = { round: 2, kind: 'exclude', tied: [B, C], chosen: B, how: 'entered' }
            const result = countIrv(question(ballots, { tieDecisions: [decision] }))

            expect(result.status).toBe('complete')
            expect(result.elected).toEqual([A])
            expect(result.rounds[1]!.ties).toEqual([{ kind: 'exclude', tied: [B, C], chosen: B, by: 'decision' }])
        })

        it('narrows to the survivors of countback before asking for a decision', () => {
            // Excluding E leaves B, C and D level on 4. Round 1 had D ahead (3, 3, 4), so countback
            // narrows the tie to B and C, and the decision is asked for that pair.
            const ballots = [...times(10, [A]), ...times(3, [B]), ...times(3, [C]), ...times(4, [D]), [E, B], [E, C]]
            const candidates = ['A', 'B', 'C', 'D', 'E']
            const unresolved = countIrv(question(ballots, { candidates }))

            expect(unresolved.rounds.map(r => r.tallies)).toEqual([units(10, 3, 3, 4, 2), units(10, 4, 4, 4, 0)])
            expect(unresolved.unresolvedTie).toEqual({ round: 3, kind: 'exclude', tied: [B, C] })

            const decision: TieDecision = { round: 3, kind: 'exclude', tied: [B, C], chosen: C, how: 'entered' }
            const settled = countIrv(question(ballots, { candidates, tieDecisions: [decision] }))

            expect(settled.rounds[2]!.ties).toEqual([{ kind: 'exclude', tied: [B, C], chosen: C, by: 'decision' }])
            expect(settled.elected).toEqual([A])
        })
    })

    it('excludes every candidate with no votes in one round', () => {
        const result = countIrv(question([...times(3, [A]), ...times(2, [B])], { candidates: ['A', 'B', 'C', 'D'] }))

        expect(result.rounds[0]!.elected).toEqual([A])
        expect(result.rounds).toHaveLength(1)

        const split = countIrv(
            question([...times(2, [A]), ...times(2, [B]), [C, A]], { candidates: ['A', 'B', 'C', 'D', 'E'] })
        )
        expect(split.rounds[1]!.action).toEqual({ type: 'exclude', candidates: [D, E] })
        expect(split.rounds[1]!.excluded).toEqual([D, E])
        expect(split.rounds[2]!.action).toEqual({ type: 'exclude', candidates: [C] })
        expect(split.elected).toEqual([A])
    })

    it('elects a lone candidate in the first round, with or without ballots', () => {
        expect(countIrv(question([], { candidates: ['A'] })).elected).toEqual([A])
        expect(countIrv(question([[A]], { candidates: ['A'] })).rounds).toHaveLength(1)
    })

    it('elects the last one standing when ballots run out', () => {
        const decision: TieDecision = { round: 2, kind: 'exclude', tied: [A, B], chosen: A, how: 'entered' }
        const result = countIrv(question([[A], [B]], { candidates: ['A', 'B'], tieDecisions: [decision] }))

        expect(result.elected).toEqual([B])
        expect(result.rounds[1]!.tallies).toEqual(units(0, 1))
    })

    it('elects nobody when no ballot is formal', () => {
        const result = countIrv(question([[], [A, A], [9]]))

        expect(result).toMatchObject({ status: 'complete', formal: 0, informal: 3, elected: [] })
        expect(result.rounds).toHaveLength(1)
    })

    it('refuses more than one seat', () => {
        expect(() => countIrv(question([[A]], { seats: 2 }))).toThrow(/exactly one/)
    })
})

describe('a published count', () => {
    interface Fixture {
        candidates: string[]
        counts: Array<{ totals: number[]; transfers: number[] }>
    }
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/aec-clark-2025.json', import.meta.url), 'utf8')) as Fixture

    /**
     * Rebuilds a set of ballots that the AEC's published distribution describes: each candidate's
     * first preferences, then, at each count, the excluded candidate's ballots split among the
     * others as published.
     */
    function ballotsFromDistribution(): number[][] {
        const piles = fixture.counts[0]!.totals.map((n, c) => times(n, [c]))
        for (const { transfers } of fixture.counts.slice(1)) {
            const from = transfers.findIndex(n => n < 0)
            const pile = piles[from]!.splice(0)
            transfers.forEach((n, to) => {
                if (n > 0) {
                    piles[to]!.push(...pile.splice(0, n).map(ballot => [...ballot, to]))
                }
            })
            expect(pile).toEqual([])
        }

        return piles.flat()
    }

    it('reproduces the AEC distribution of preferences for Clark, 2025', () => {
        const result = countIrv(question(ballotsFromDistribution(), { candidates: fixture.candidates }))

        expect(result.formal).toBe(67_531)
        // The AEC distributes until two candidates remain; the count stops at a majority, which
        // Andrew Wilkie reaches when Cathy Griggs's ballots move.
        expect(result.rounds.map(r => r.tallies)).toEqual(
            fixture.counts.slice(0, 2).map(({ totals }) => totals.map(t => `${t}.000000`))
        )
        expect(result.rounds[1]!.action).toEqual({ type: 'exclude', candidates: [4] })
        expect(result.elected.map(c => fixture.candidates[c])).toEqual(['Andrew WILKIE'])
    })
})
