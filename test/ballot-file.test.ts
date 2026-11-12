import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
    BallotFileError,
    NOTICE_TEXT,
    ballotsHash,
    canonicalJson,
    fileHash,
    parseBallotFile,
} from '../src/ballot-file.ts'
import type { BallotFile, ElectionQuestion, ResolutionQuestion } from '../src/types.ts'

function election(overrides: Partial<ElectionQuestion> = {}): ElectionQuestion {
    return {
        id: 'q1',
        kind: 'election',
        title: 'Committee',
        method: 'stv-wigm',
        seats: 2,
        candidates: ['A', 'B', 'C'],
        minPreferences: 1,
        ballots: [[1], [0, 2], [0]],
        tieDecisions: [
            { round: 2, kind: 'exclude', tied: [1, 2], chosen: 1, how: 'draw', witnessValue: 'kookaburra' },
        ],
        ...overrides,
    }
}

function resolution(overrides: Partial<ResolutionQuestion> = {}): ResolutionQuestion {
    return {
        id: 'q2',
        kind: 'resolution',
        title: 'Fees',
        motion: 'Raise fees',
        threshold: { rule: 'at-least', numerator: 3, denominator: 4 },
        base: 'for-against',
        ballots: ['for', 'abstain', 'against'],
        ...overrides,
    }
}

function file(questions: BallotFile['questions'] = [election(), resolution()]): BallotFile {
    return {
        format: 'lockpad-ballots',
        version: 1,
        engine: '1.0.0',
        title: 'AGM',
        notice: NOTICE_TEXT,
        questions,
    }
}

/** A deep copy with the keys of every object reversed, so key order can't come from the input. */
function reversedKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(reversedKeys)
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .reverse()
                .map(([key, inner]) => [key, reversedKeys(inner)])
        )
    }

    return value
}

function parseWith(mutate: (raw: Record<string, any>) => void): () => BallotFile {
    const raw = JSON.parse(JSON.stringify(file())) as Record<string, any>
    mutate(raw)

    return () => parseBallotFile(JSON.stringify(raw))
}

describe('NOTICE_TEXT', () => {
    it('warns about distinctive rankings', () => {
        expect(NOTICE_TEXT).toBe(
            'This file holds every ballot without any link to a voter. An unusual ranking could still identify a voter to someone who told them how to rank, so share it only when you need to.'
        )
    })
})

describe('parseBallotFile', () => {
    it('reads a valid file back unchanged', () => {
        expect(parseBallotFile(JSON.stringify(file()))).toEqual(file())
    })

    it('reads a file that starts with a byte-order mark', () => {
        expect(parseBallotFile(`\ufeff${JSON.stringify(file())}`)).toEqual(file())
    })

    it('accepts every method, base and tie kind', () => {
        const questions = [
            election({ id: 'a', method: 'plurality', ballots: [[0, 2]], tieDecisions: [] }),
            election({
                id: 'b',
                method: 'irv',
                seats: 1,
                minPreferences: 0,
                tieDecisions: [
                    { round: 1, kind: 'elect', tied: [0, 1], chosen: 0, how: 'entered' },
                    { round: 3, kind: 'surplus-order', tied: [0, 1, 2], chosen: 2, how: 'entered' },
                ],
            }),
            resolution({ id: 'c', base: 'all-ballots', threshold: { rule: 'more-than', numerator: 1, denominator: 2 } }),
            resolution({ id: 'd', base: { fixed: 21 }, ballots: [] }),
        ]

        expect(parseBallotFile(JSON.stringify(file(questions)))).toEqual(file(questions))
    })

    it('keeps informal ballots, which the count reports', () => {
        const questions = [election({ ballots: [[], [0, 0], [7], [-1]], tieDecisions: [] })]

        expect(parseBallotFile(JSON.stringify(file(questions))).questions).toEqual(questions)
    })

    it.each([
        ['invalid JSON', () => parseBallotFile('{'), /isn't valid JSON/],
        ['a list at the top level', () => parseBallotFile('[]'), /should be an object/],
        ['a wrong format', parseWith(raw => (raw.format = 'other')), /isn't a lockpad ballot file/],
        ['version 2', parseWith(raw => (raw.version = 2)), /version 2 .* can only read version 1/],
        ['a missing questions list', parseWith(raw => delete raw.questions), /has no questions/],
        ['an empty questions list', parseWith(raw => (raw.questions = [])), /has no questions/],
        ['an unknown field', parseWith(raw => (raw.extra = true)), /unknown field "extra"/],
        ['a missing engine', parseWith(raw => delete raw.engine), /engine should be text/],
        ['a question that isn\'t an object', parseWith(raw => (raw.questions[0] = 'q1')), /Question 1: it should be an object/],
        ['a question id that isn\'t text', parseWith(raw => (raw.questions[0].id = 7)), /Question 1: id should be text/],
        ['a tie decision that isn\'t an object', parseWith(raw => (raw.questions[0].tieDecisions[0] = 2)), /tie decision 1: it should be an object/],
        ['a tied list that isn\'t a list', parseWith(raw => (raw.questions[0].tieDecisions[0].tied = '1,2')), /tied should list at least two candidates/],
        ['an unknown threshold field', parseWith(raw => (raw.questions[1].threshold.percent = 75)), /threshold: unknown field "percent"/],
        ['a notice that isn\'t the standard one', parseWith(raw => (raw.notice = 'Share freely.')), /notice should be the standard notice/],
        ['question ids that differ only in accent encoding', parseWith(raw => {
            raw.questions[0].id = 'Caf\u00e9'
            raw.questions[1].id = 'Cafe\u0301'
        }), /is used twice/],
        ['plurality needing more marks than seats', parseWith(raw => {
            raw.questions[0].method = 'plurality'
            raw.questions[0].minPreferences = 3
        }), /minPreferences should be a whole number from 0 to 2/],
        ['a repeated question id', parseWith(raw => (raw.questions[1].id = 'q1')), /id "q1" is used twice/],
        ['an empty question id', parseWith(raw => (raw.questions[0].id = '')), /id should not be empty/],
        ['an unknown question kind', parseWith(raw => (raw.questions[0].kind = 'poll')), /kind should be "election" or "resolution"/],
        ['an unknown method', parseWith(raw => (raw.questions[0].method = 'borda')), /method should be one of/],
        ['non-integer seats', parseWith(raw => (raw.questions[0].seats = 1.5)), /seats should be a whole number of at least 1/],
        ['zero seats', parseWith(raw => (raw.questions[0].seats = 0)), /seats should be a whole number of at least 1/],
        ['two seats for instant runoff', parseWith(raw => {
            raw.questions[0].method = 'irv'
        }), /instant runoff elects exactly one/],
        ['no candidates', parseWith(raw => (raw.questions[0].candidates = [])), /needs at least one candidate/],
        ['a blank candidate name', parseWith(raw => (raw.questions[0].candidates[1] = ' \t')), /candidate 2 has no name/],
        ['two candidates with one name', parseWith(raw => (raw.questions[0].candidates = ['A', 'B', 'A'])), /candidate "A" is listed twice/],
        ['a candidate that isn\'t text', parseWith(raw => (raw.questions[0].candidates[0] = 1)), /candidate 1 should be text/],
        ['too many minimum preferences', parseWith(raw => (raw.questions[0].minPreferences = 4)), /minPreferences should be a whole number from 0 to 3/],
        ['a ballot that isn\'t a list', parseWith(raw => (raw.questions[0].ballots[0] = 1)), /ballot 1 should be a list of candidate numbers/],
        ['a fractional preference', parseWith(raw => (raw.questions[0].ballots[2] = [0.5])), /ballot 3 should be a list of candidate numbers/],
        ['a missing tieDecisions list', parseWith(raw => delete raw.questions[0].tieDecisions), /tieDecisions should be a list/],
        ['a tie decision in round 0', parseWith(raw => (raw.questions[0].tieDecisions[0].round = 0)), /tie decision 1: round should be a whole number of at least 1/],
        ['an unknown tie kind', parseWith(raw => (raw.questions[0].tieDecisions[0].kind = 'coin')), /tie decision 1: kind should be one of/],
        ['an unsorted tied list', parseWith(raw => (raw.questions[0].tieDecisions[0].tied = [2, 1])), /tie decision 1: tied should list at least two candidates in ascending order/],
        ['a one-candidate tied list', parseWith(raw => (raw.questions[0].tieDecisions[0].tied = [1])), /tied should list at least two candidates/],
        ['a tied candidate that does not exist', parseWith(raw => (raw.questions[0].tieDecisions[0].tied = [1, 3])), /tie decision 1: candidate 4 doesn't exist/],
        ['a chosen candidate outside the tie', parseWith(raw => (raw.questions[0].tieDecisions[0].chosen = 0)), /tie decision 1: chosen should be one of the tied candidates/],
        ['an unknown how', parseWith(raw => (raw.questions[0].tieDecisions[0].how = 'coin')), /how should be "draw" or "entered"/],
        ['a draw without a witness value', parseWith(raw => delete raw.questions[0].tieDecisions[0].witnessValue), /a draw needs its witnessValue/],
        ['a draw with a blank witness value', parseWith(raw => (raw.questions[0].tieDecisions[0].witnessValue = '  ')), /a draw needs its witnessValue/],
        ['an entered decision with a witness value', parseWith(raw => (raw.questions[0].tieDecisions[0].how = 'entered')), /only a draw has a witnessValue/],
        ['two decisions for one tie', parseWith(raw => raw.questions[0].tieDecisions.push(raw.questions[0].tieDecisions[0])), /tie decision 2 repeats tie decision 1/],
        ['a missing motion', parseWith(raw => delete raw.questions[1].motion), /motion should be text/],
        ['an unknown threshold rule', parseWith(raw => (raw.questions[1].threshold.rule = 'most')), /threshold rule should be "more-than" or "at-least"/],
        ['a threshold that isn\'t an object', parseWith(raw => (raw.questions[1].threshold = '3/4')), /threshold should be an object/],
        ['a zero denominator', parseWith(raw => (raw.questions[1].threshold.denominator = 0)), /threshold should be a fraction from 0 to 1/],
        ['a threshold above one', parseWith(raw => (raw.questions[1].threshold.numerator = 5)), /threshold should be a fraction from 0 to 1/],
        ['an unknown base', parseWith(raw => (raw.questions[1].base = 'members')), /base should be "for-against", "all-ballots" or \{"fixed": n\}/],
        ['a negative fixed base', parseWith(raw => (raw.questions[1].base = { fixed: -1 })), /base should be "for-against", "all-ballots" or \{"fixed": n\}/],
        ['an unknown resolution answer', parseWith(raw => (raw.questions[1].ballots[0] = 'yes')), /ballot 1 should be "for", "against" or "abstain"/],
    ])('rejects %s', (_name, parse, message) => {
        expect(parse).toThrow(BallotFileError)
        expect(parse).toThrow(message)
    })
})

describe('canonicalJson', () => {
    it('writes keys in the declared order with no whitespace, whatever the input order', () => {
        const expected =
            '{"format":"lockpad-ballots","version":1,"engine":"1.0.0","title":"AGM","notice":' +
            JSON.stringify(NOTICE_TEXT) +
            ',"questions":[{"id":"q1","kind":"election","title":"Committee","method":"stv-wigm","seats":2,' +
            '"candidates":["A","B","C"],"minPreferences":1,"ballots":[[0],[0,2],[1]],"tieDecisions":' +
            '[{"round":2,"kind":"exclude","tied":[1,2],"chosen":1,"how":"draw","witnessValue":"kookaburra"}]},' +
            '{"id":"q2","kind":"resolution","title":"Fees","motion":"Raise fees","threshold":' +
            '{"rule":"at-least","numerator":3,"denominator":4},"base":"for-against","ballots":["abstain","against","for"]}]}'

        expect(canonicalJson(file())).toBe(expected)
        expect(canonicalJson(reversedKeys(file()) as BallotFile)).toBe(expected)
    })

    it('writes a fixed base as an object', () => {
        expect(canonicalJson(file([resolution({ base: { fixed: 21 } })]))).toContain('"base":{"fixed":21}')
    })

    it('normalises every string to NFC', () => {
        const composed = file([election({ title: 'Café', candidates: ['Renée', 'B', 'C'] })])
        const decomposed = file([election({ title: 'Café', candidates: ['Renée', 'B', 'C'] })])

        expect(canonicalJson(decomposed)).toBe(canonicalJson(composed))
        expect(canonicalJson(composed)).toContain('"Café"')
    })

    it('keeps emoji intact', () => {
        expect(canonicalJson(file([election({ candidates: ['🦘 Roo', 'B', 'C'] })]))).toContain('"🦘 Roo"')
    })

    it('sorts the marks on a plurality ballot', () => {
        const json = canonicalJson(file([election({ method: 'plurality', ballots: [[2, 0]], tieDecisions: [] })]))

        expect(json).toContain('"ballots":[[0,2]]')
    })

    it('keeps the preference order on a ranked ballot', () => {
        expect(canonicalJson(file([election({ ballots: [[2, 0]], tieDecisions: [] })]))).toContain('"ballots":[[2,0]]')
    })

    it('sorts ballots numerically, shorter prefix first', () => {
        const candidates = Array.from({ length: 11 }, (_, i) => `C${i}`)
        const json = canonicalJson(
            file([election({ candidates, ballots: [[10], [2, 1], [2], [], [1, 10], [1, 2]], tieDecisions: [] })])
        )

        expect(json).toContain('"ballots":[[],[1,2],[1,10],[2],[2,1],[10]]')
    })

    it('sorts tie decisions by round, then kind, then tied', () => {
        const json = canonicalJson(
            file([
                election({
                    candidates: ['A', 'B', 'C', 'D'],
                    tieDecisions: [
                        { round: 3, kind: 'exclude', tied: [0, 1], chosen: 0, how: 'entered' },
                        { round: 2, kind: 'surplus-order', tied: [0, 1], chosen: 0, how: 'entered' },
                        { round: 2, kind: 'exclude', tied: [1, 3], chosen: 1, how: 'entered' },
                        { round: 2, kind: 'exclude', tied: [1, 2, 3], chosen: 1, how: 'entered' },
                    ],
                }),
            ])
        )
        const order = [...json.matchAll(/"round":(\d),"kind":"([a-z-]+)","tied":\[([\d,]+)\]/g)].map(
            m => `${m[1]} ${m[2]} ${m[3]}`
        )

        expect(order).toEqual(['2 exclude 1,2,3', '2 exclude 1,3', '2 surplus-order 0,1', '3 exclude 0,1'])
    })

    it('sorts resolution ballots abstain, against, for', () => {
        const json = canonicalJson(file([resolution({ ballots: ['for', 'against', 'for', 'abstain'] })]))

        expect(json).toContain('"ballots":["abstain","against","for","for"]')
    })

    it('does not change the file it is given', () => {
        const input = file([election({ ballots: [[2], [1]], tieDecisions: [] })])
        canonicalJson(input)

        expect((input.questions[0] as ElectionQuestion).ballots).toEqual([[2], [1]])
    })
})

describe('hashes', () => {
    const decided = file()
    const undecided = file([election({ tieDecisions: [] }), resolution()])
    const shuffled = file([election({ ballots: [[0], [1], [0, 2]] }), resolution({ ballots: ['against', 'for', 'abstain'] })])

    it('hashes the canonical bytes', () => {
        expect(fileHash(decided)).toBe(createHash('sha256').update(canonicalJson(decided), 'utf8').digest('hex'))
        expect(ballotsHash(decided)).toBe(
            createHash('sha256').update(canonicalJson(undecided), 'utf8').digest('hex')
        )
    })

    it('leaves the ballots hash alone when tie decisions change', () => {
        expect(ballotsHash(decided)).toBe(ballotsHash(undecided))
    })

    it('changes the file hash when tie decisions change', () => {
        expect(fileHash(decided)).not.toBe(fileHash(undecided))
    })

    it('ignores the order ballots arrive in', () => {
        expect(ballotsHash(shuffled)).toBe(ballotsHash(decided))
        expect(fileHash(shuffled)).toBe(fileHash(decided))
    })
})
