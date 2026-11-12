import { describe, expect, it } from 'vitest'
import { BallotFileError, NOTICE_TEXT, ballotsHash, fileHash } from '../src/ballot-file.ts'
import { countFile, countQuestion } from '../src/count.ts'
import { drawCandidate } from '../src/draw.ts'
import type { BallotFile, ElectionQuestion, Method, ResolutionQuestion } from '../src/types.ts'
import { ENGINE_VERSION } from '../src/version.ts'

function election(method: Method, overrides: Partial<ElectionQuestion> = {}): ElectionQuestion {
    return {
        id: method,
        kind: 'election',
        title: method,
        method,
        seats: 1,
        candidates: ['A', 'B', 'C'],
        minPreferences: 1,
        ballots: [[0, 1], [0, 2], [1], [2, 1]],
        tieDecisions: [],
        ...overrides,
    }
}

const resolution: ResolutionQuestion = {
    id: 'r1',
    kind: 'resolution',
    title: 'Rules',
    motion: 'Adopt the new rules',
    threshold: { rule: 'at-least', numerator: 3, denominator: 4 },
    base: 'for-against',
    ballots: ['for', 'for', 'for', 'against'],
}

function file(questions: BallotFile['questions'], engine = ENGINE_VERSION): BallotFile {
    return { format: 'lockpad-ballots', version: 1, engine, title: 'AGM', notice: NOTICE_TEXT, questions }
}

describe('countQuestion', () => {
    it.each(['plurality', 'irv', 'stv-wigm'] as const)('counts a %s election with its own method', method => {
        const result = countQuestion(election(method))

        expect(result).toMatchObject({ kind: 'election', method, questionId: method })
    })

    it('counts a resolution', () => {
        expect(countQuestion(resolution)).toMatchObject({ kind: 'resolution', carried: true })
    })
})

describe('countFile', () => {
    it('counts every question and reports the hashes and versions', () => {
        const ballots = file([election('irv'), resolution], '0.9.0')
        const output = countFile(ballots)

        expect(output).toEqual({
            engine: ENGINE_VERSION,
            fileEngine: '0.9.0',
            ballotsHash: ballotsHash(ballots),
            fileHash: fileHash(ballots),
            results: [countQuestion(election('irv')), countQuestion(resolution)],
        })
    })

    describe('a drawn tie decision', () => {
        // 3 for A, 2 each for B and C: excluding B or C is a tie countback can't break.
        const base = election('irv', { ballots: [[0], [0], [0], [1], [1], [2], [2]] })
        const seed = ballotsHash(file([base]))
        const drawn = drawCandidate(seed, 'irv', 2, 'exclude', 'kookaburra', [1, 2])

        it('is counted when it matches the seeded draw', () => {
            const q = { ...base, tieDecisions: [{ round: 2, kind: 'exclude' as const, tied: [1, 2], chosen: drawn, how: 'draw' as const, witnessValue: 'kookaburra' }] }
            const result = countFile(file([q])).results[0]!

            expect(result).toMatchObject({ status: 'complete', elected: [0] })
        })

        it('is refused when it does not match', () => {
            const q = { ...base, tieDecisions: [{ round: 2, kind: 'exclude' as const, tied: [1, 2], chosen: 3 - drawn, how: 'draw' as const, witnessValue: 'kookaburra' }] }

            expect(() => countFile(file([q]))).toThrow(BallotFileError)
            expect(() => countFile(file([q]))).toThrow(/Question 1 \(irv\), tie decision 1: the draw with "kookaburra" picks [BC], not [BC]\./)
        })

        it('trusts an entered decision as it stands', () => {
            const q = { ...base, tieDecisions: [{ round: 2, kind: 'exclude' as const, tied: [1, 2], chosen: 3 - drawn, how: 'entered' as const }] }

            expect(countFile(file([q])).results[0]).toMatchObject({ status: 'complete', elected: [0] })
        })
    })
})
