import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { countStvWigm } from '../src/stv-wigm.ts'
import type { ElectionResult } from '../src/results.ts'
import type { ElectionQuestion, TieDecision } from '../src/types.ts'

const [A, B, C, D, E, F] = [0, 1, 2, 3, 4, 5]

function times(n: number, ballot: number[]): number[][] {
    return Array.from({ length: n }, () => [...ballot])
}

function question(seats: number, candidateCount: number, ballots: number[][], tieDecisions: TieDecision[] = []): ElectionQuestion {
    return {
        id: 'q1',
        kind: 'election',
        title: 'Committee',
        method: 'stv-wigm',
        seats,
        candidates: ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, candidateCount),
        minPreferences: 1,
        ballots,
        tieDecisions,
    }
}

/** Parses a 6 dp string back to millionths. */
const millionths = (s: string) => BigInt(s.replace('.', ''))

/** Every round's tallies, exhausted and lost to rounding must add up to the formal ballots. */
function count(q: ElectionQuestion): ElectionResult {
    const result = countStvWigm(q)
    for (const round of result.rounds) {
        const sum = [...round.tallies, round.exhausted, round.lostToRounding].reduce((total, s) => total + millionths(s), 0n)
        expect(sum, `round ${round.number}`).toBe(BigInt(result.formal) * 1_000_000n)
    }

    return result
}

const tallies = (result: ElectionResult) => result.rounds.map(round => round.tallies.map(Number))

describe('countStvWigm', () => {
    it('counts the 17-ballot vector', () => {
        const result = count(
            question(2, 4, [...times(6, [A, B, C]), ...times(2, [A, C]), ...times(4, [B]), ...times(3, [C, D]), [D, C], [D]])
        )

        expect(result).toMatchObject({ status: 'complete', formal: 17, informal: 0, quota: '6.000000', elected: [A, B] })
        expect(tallies(result)).toEqual([
            [8, 4, 3, 2],
            [6, 5.5, 3.5, 2],
            [6, 5.5, 4.5, 0],
            [6, 5.5, 0, 0],
        ])
        expect(result.rounds.map(r => r.action)).toEqual([
            { type: 'first-count' },
            { type: 'surplus', from: A, transferValue: '0.250000' },
            { type: 'exclude', candidates: [D] },
            { type: 'exclude', candidates: [C] },
        ])
        expect(result.rounds.map(r => r.elected)).toEqual([[A], [], [], [B]])
        expect(result.rounds.map(r => r.exhausted)).toEqual(['0.000000', '0.000000', '1.000000', '5.500000'])
        expect(result.rounds[1]!.lostToRounding).toBe('0.000000')
        expect(result.rounds.map(r => r.excluded)).toEqual([[], [], [D], [C]])
    })

    it('truncates the transfer value and each new weight', () => {
        const result = count(question(2, 3, [...times(2, [A, B]), [A, C]]))

        expect(result.quota).toBe('2.000000')
        expect(result.rounds[0]!.tallies).toEqual(['3.000000', '0.000000', '0.000000'])
        expect(result.rounds[0]!.elected).toEqual([A])
        expect(result.rounds[1]!.action).toEqual({ type: 'surplus', from: A, transferValue: '0.333333' })
        expect(result.rounds[1]!.tallies).toEqual(['2.000000', '0.666666', '0.333333'])
        expect(result.rounds[1]!.lostToRounding).toBe('0.000001')
        expect(result.rounds[2]!.action).toEqual({ type: 'exclude', candidates: [C] })
        expect(result.rounds[2]!.tallies).toEqual(['2.000000', '0.666666', '0.000000'])
        expect(result.rounds[2]!.exhausted).toBe('0.333333')
        expect(result.rounds[2]!.elected).toEqual([B])
        expect(result.elected).toEqual([A, B])
    })

    it('transfers a surplus made of ballots of different weights', () => {
        // Quota floor(21 / 4) + 1 = 6.
        // R1: A 10 is elected. R2: A's surplus 4 at 4/10 = 0.4 gives B 3 + 10 × 0.4 = 7, elected.
        // R3: B's surplus 1 at trunc(1/7) = 0.142857. B's 3 [B,C] ballots at 1 give C 3 × 0.142857
        //     = 0.428571; the 10 [A,B,D] ballots at 0.4 become trunc(0.4 × 0.142857) = 0.057142
        //     each, giving D 0.571420. Lost: 1 − 0.999991 = 0.000009.
        // R4: E (2) is excluded, to D: 5.571420. R5: C (3.428571) is excluded and all of it
        //     exhausts; D is the only one left for the last seat.
        const result = count(
            question(3, 5, [...times(10, [A, B, D]), ...times(3, [B, C]), ...times(3, [C]), ...times(3, [D]), ...times(2, [E, D])])
        )

        expect(result.quota).toBe('6.000000')
        expect(result.rounds.map(r => r.tallies)).toEqual([
            ['10.000000', '3.000000', '3.000000', '3.000000', '2.000000'],
            ['6.000000', '7.000000', '3.000000', '3.000000', '2.000000'],
            ['6.000000', '6.000000', '3.428571', '3.571420', '2.000000'],
            ['6.000000', '6.000000', '3.428571', '5.571420', '0.000000'],
            ['6.000000', '6.000000', '0.000000', '5.571420', '0.000000'],
        ])
        expect(result.rounds[1]!.elected).toEqual([B])
        expect(result.rounds[2]!.action).toEqual({ type: 'surplus', from: B, transferValue: '0.142857' })
        expect(result.rounds[2]!.lostToRounding).toBe('0.000009')
        expect(result.rounds[4]!.exhausted).toBe('3.428571')
        expect(result.elected).toEqual([A, B, D])
    })

    it('truncates surplus × weight ÷ total once per ballot', () => {
        // Quota 5. A's surplus 3 of 8 gives each [A,B,D] ballot 0.375, lifting B to 6.
        // B's surplus 1 of 6: a [B,C] ballot at 1 becomes trunc(1/6) = 0.166666, and an [A,B,D]
        // ballot at 0.375 becomes trunc(1 × 0.375 / 6) = 0.0625 exactly. (Truncating the
        // transfer value first would give trunc(0.166666 × 0.375) = 0.062499.)
        const result = count(question(3, 5, [...times(8, [A, B, D]), ...times(3, [B, C]), [C], ...times(2, [D]), ...times(3, [E, D])]))

        expect(result.rounds[1]!.tallies).toEqual(['5.000000', '6.000000', '1.000000', '2.000000', '3.000000'])
        expect(result.rounds[2]!.action).toEqual({ type: 'surplus', from: B, transferValue: '0.166666' })
        expect(result.rounds[2]!.tallies).toEqual(['5.000000', '5.000000', '1.499998', '2.500000', '3.000000'])
        expect(result.rounds[2]!.lostToRounding).toBe('0.000002')
        expect(result.rounds[4]!.exhausted).toBe('3.999998')
        expect(result.elected).toEqual([A, B, E])
    })

    it('skips a candidate already elected when a ballot moves on', () => {
        // Quota 4. A and B are both elected on the first count; A's ballots skip B for C.
        const result = count(question(3, 4, [...times(6, [A, B, C]), ...times(5, [B]), ...times(2, [C]), ...times(2, [D])]))

        expect(result.rounds[0]!.elected).toEqual([A, B])
        expect(result.rounds[1]!.tallies).toEqual(['4.000000', '5.000000', '3.999998', '2.000000'])
        expect(result.rounds[2]!.action).toEqual({ type: 'surplus', from: B, transferValue: '0.200000' })
        expect(result.rounds[2]!.exhausted).toBe('1.000000')
        expect(result.elected).toEqual([A, B, C])
    })

    describe('two surpluses at once', () => {
        it('transfers the larger first', () => {
            // Quota 5. A has 7 (surplus 2), B has 6 (surplus 1).
            const result = count(question(3, 5, [...times(7, [A, C]), ...times(6, [B, D]), [C], [D], [E]]))

            expect(result.rounds[1]!.action).toEqual({ type: 'surplus', from: A, transferValue: '0.285714' })
            expect(result.rounds[2]!.action).toEqual({ type: 'surplus', from: B, transferValue: '0.166666' })
            expect(result.rounds[1]!.ties).toEqual([])
            expect(result.rounds[2]!.lostToRounding).toBe('0.000006')
            expect(result.elected).toEqual([A, B, C])
        })

        it('orders equal surpluses by countback', () => {
            // Quota 5. A's surplus 5 at 0.5 lifts B (4 + 2) and C (3 + 3) to 6 each. Round 1 had B
            // ahead, so B's surplus goes first.
            const ballots = [...times(4, [A, B]), ...times(6, [A, C]), ...times(4, [B]), ...times(3, [C]), ...times(3, [D]), ...times(2, [E]), [F]]
            const result = count(question(4, 6, ballots))

            expect(result.quota).toBe('5.000000')
            expect(result.rounds[1]!.elected).toEqual([B, C])
            expect(result.rounds[2]!.action).toEqual({ type: 'surplus', from: B, transferValue: '0.166666' })
            expect(result.rounds[2]!.ties).toEqual([{ kind: 'surplus-order', tied: [B, C], chosen: B, by: 'countback' }])
            expect(result.rounds[3]!.action).toEqual({ type: 'surplus', from: C, transferValue: '0.166666' })
            expect(result.elected).toEqual([A, B, C, D])
        })

        describe('equal on the first count', () => {
            // Quota 5. A and B both have 7, with no earlier round for countback.
            const ballots = [...times(7, [A, C]), ...times(7, [B, D]), [C], [D], [E]]

            it('needs a surplus-order decision', () => {
                const result = count(question(3, 5, ballots))

                expect(result.status).toBe('tie-unresolved')
                expect(result.unresolvedTie).toEqual({ round: 2, kind: 'surplus-order', tied: [A, B] })
                expect(result.elected).toEqual([A, B])
                expect(result.rounds).toHaveLength(1)
            })

            it('follows the decision, then breaks a later exclusion tie by countback', () => {
                const decision: TieDecision = { round: 2, kind: 'surplus-order', tied: [A, B], chosen: B, how: 'entered' }
                const result = count(question(3, 5, ballots, [decision]))

                expect(result.rounds[1]!.action).toEqual({ type: 'surplus', from: B, transferValue: '0.285714' })
                expect(result.rounds[1]!.ties).toEqual([{ kind: 'surplus-order', tied: [A, B], chosen: B, by: 'decision' }])
                expect(result.rounds[2]!.action).toEqual({ type: 'surplus', from: A, transferValue: '0.285714' })
                // E goes, then C and D are level on 2.999998; round 2 had C on 1 and D on 2.999998.
                expect(result.rounds[3]!.action).toEqual({ type: 'exclude', candidates: [E] })
                expect(result.rounds[4]!.ties).toEqual([{ kind: 'exclude', tied: [C, D], chosen: C, by: 'countback' }])
                expect(result.elected).toEqual([A, B, D])
            })
        })
    })

    describe('an exclusion tie countback cannot break', () => {
        // Quota 4. A is elected; B and C are level in every round.
        const ballots = [...times(4, [A]), ...times(2, [B]), ...times(2, [C]), [D]]

        it('is unresolved without a decision', () => {
            const result = count(question(2, 4, ballots))

            expect(result.rounds[1]!.action).toEqual({ type: 'exclude', candidates: [D] })
            expect(result.status).toBe('tie-unresolved')
            expect(result.unresolvedTie).toEqual({ round: 3, kind: 'exclude', tied: [B, C] })
        })

        it('is settled by a decision', () => {
            const decision: TieDecision = { round: 3, kind: 'exclude', tied: [B, C], chosen: C, how: 'draw', witnessValue: 'kookaburra' }
            const result = count(question(2, 4, ballots, [decision]))

            expect(result.rounds[2]!.ties).toEqual([{ kind: 'exclude', tied: [B, C], chosen: C, by: 'decision' }])
            expect(result.elected).toEqual([A, B])
        })
    })

    it('excludes every candidate with no votes together', () => {
        // Quota 4. A is elected with no surplus; D and E have nothing.
        const result = count(question(2, 5, [...times(4, [A]), ...times(3, [B]), ...times(2, [C])]))

        expect(result.rounds[0]!.elected).toEqual([A])
        expect(result.rounds[1]!.action).toEqual({ type: 'exclude', candidates: [D, E] })
        expect(result.rounds[1]!.excluded).toEqual([D, E])
        expect(result.rounds[2]!.action).toEqual({ type: 'exclude', candidates: [C] })
        expect(result.elected).toEqual([A, B])
    })

    it('excludes zero-vote candidates together when exactly enough remain', () => {
        // Quota 3. A's surplus of 1 exhausts. C and D have nothing; excluding both leaves B for
        // the last seat.
        const result = count(question(2, 4, [...times(4, [A]), ...times(2, [B])]))

        expect(result.rounds[2]!.action).toEqual({ type: 'exclude', candidates: [C, D] })
        expect(result).toMatchObject({ status: 'complete', elected: [A, B] })
    })

    it('stops when the last seat fills, leaving any surplus untransferred', () => {
        // Quota 4. A's surplus lifts B to 4.999998, filling the last seat with B's own surplus
        // still waiting; it is never transferred.
        const result = count(question(2, 4, [...times(6, [A, B]), ...times(3, [B]), [C], [D]]))

        expect(result.rounds).toHaveLength(2)
        expect(result.rounds[1]!.elected).toEqual([B])
        expect(result.elected).toEqual([A, B])
    })

    it('does not exclude zero-vote candidates together when that would decide a seat', () => {
        // Quota 2. A's surplus exhausts; B, C and D have nothing, and two seats are left, so one
        // of them must be excluded by decision.
        const result = count(question(3, 4, times(4, [A])))

        expect(result.status).toBe('tie-unresolved')
        expect(result.unresolvedTie).toEqual({ round: 3, kind: 'exclude', tied: [B, C, D] })
    })

    it('elects every candidate of an uncontested election', () => {
        const result = count(question(3, 3, [[C], [C], [B]]))

        expect(result).toMatchObject({ status: 'complete', elected: [C, B, A] })
        expect(result.rounds).toHaveLength(1)
        expect(result.rounds[0]!.elected).toEqual([C, B, A])
    })

    it('orders an uncontested election with equal tallies by candidate order', () => {
        const result = count(question(3, 3, [[A], [B], [C]]))

        expect(result.status).toBe('complete')
        expect(result.elected).toEqual([A, B, C])
        expect(result.rounds[0]!.ties).toEqual([])
    })

    it('elects every candidate of an uncontested election with no ballots', () => {
        const result = count(question(2, 2, []))

        expect(result).toMatchObject({ status: 'complete', formal: 0, quota: '1.000000', elected: [A, B] })
    })

    it('elects nobody in a contested election with no formal ballots', () => {
        const result = count(question(2, 4, [[], [A, A], [9]]))

        expect(result).toMatchObject({ status: 'complete', formal: 0, informal: 3, quota: '1.000000', elected: [] })
        expect(result.rounds).toHaveLength(1)
    })
})

describe('a published count', () => {
    interface Fixture {
        title: string
        seats: number
        candidates: string[]
        weightedBallots: number[][]
        officialStages: Array<{ stage: number; candidate: string; votes: string; status: string }>
    }
    const fixture = JSON.parse(
        readFileSync(new URL('./fixtures/shetland-central-2022.json', import.meta.url), 'utf8')
    ) as Fixture
    const ballots = fixture.weightedBallots.flatMap(([weight, ...preferences]) =>
        times(weight!, preferences.map(p => p - 1))
    )
    const result = count({
        ...question(fixture.seats, 0, ballots),
        candidates: fixture.candidates,
    })
    const official = (stage: number, candidate: string) =>
        fixture.officialStages.find(s => s.stage === stage && s.candidate === candidate)!

    it('elects the same councillors as the official count', () => {
        // Shetland Islands Council 2022, Ward 4 Shetland Central: 1,414 ballots, 4 seats.
        expect(result.formal).toBe(1414)
        expect(result.quota).toBe('283.000000')
        expect(result.rounds).toHaveLength(2)
        expect(result.elected.map(c => fixture.candidates[c])).toEqual([
            'Moraig LYALL',
            'Davie SANDISON',
            'Catherine HUGHSON',
            'Ian SCOTT',
        ])
        for (const [stage, round] of [[1, result.rounds[0]!], [2, result.rounds[1]!]] as const) {
            const electedHere = fixture.officialStages
                .filter(s => s.stage === stage && s.status === 'Elected')
                .map(s => s.candidate)
            expect(round.elected.map(c => fixture.candidates[c]).sort()).toEqual(electedHere.sort())
        }
    })

    it('matches the first count exactly', () => {
        fixture.candidates.forEach((name, c) => {
            expect(result.rounds[0]!.tallies[c]).toBe(`${official(1, name).votes}.000000`)
        })
    })

    it('moves the same ballots as the official surplus transfer, differing only in decimal places', () => {
        // The official count truncates to 5 places (131/414 = 0.31642); lockpad truncates to 6
        // (0.316425). Each candidate must receive the same number of ballots at each rate.
        expect(result.rounds[1]!.action).toEqual({ type: 'surplus', from: 1, transferValue: '0.316425' })
        const received = (c: number) => millionths(result.rounds[1]!.tallies[c]!) - millionths(result.rounds[0]!.tallies[c]!)
        const officialReceived = (name: string) =>
            millionths(official(2, name).votes + '0') - millionths(official(1, name).votes + '.000000')

        for (const [c, name] of fixture.candidates.entries()) {
            if (c === 1) {
                continue
            }
            const papers = received(c) / 316_425n
            expect(received(c) % 316_425n, name).toBe(0n)
            expect(officialReceived(name), name).toBe(papers * 316_420n)
        }
        const exhaustedPapers = millionths(result.rounds[1]!.exhausted) / 316_425n
        expect(millionths(official(2, 'Non-transferable').votes + '0')).toBe(exhaustedPapers * 316_420n)
    })
})
