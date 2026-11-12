import { describe, expect, it } from 'vitest'
import { canonicalJson, NOTICE_TEXT } from '../src/ballot-file.ts'
import { BltError, parseBlt, toBlt } from '../src/blt.ts'
import type { ElectionQuestion } from '../src/types.ts'

const [A, B, C, D] = [0, 1, 2, 3]

function times(n: number, ballot: number[]): number[][] {
    return Array.from({ length: n }, () => [...ballot])
}

function question(overrides: Partial<ElectionQuestion> = {}): ElectionQuestion {
    return {
        id: 'q1',
        kind: 'election',
        title: 'Committee 2026',
        method: 'stv-wigm',
        seats: 2,
        candidates: ['A', 'B', 'C', 'D'],
        minPreferences: 1,
        ballots: [...times(6, [A, B, C]), ...times(2, [A, C]), ...times(4, [B]), ...times(3, [C, D]), [D, C], [D]],
        tieDecisions: [],
        ...overrides,
    }
}

/** The ballots in canonical order, as the ballot file stores them. */
function canonicalBallots(q: Pick<ElectionQuestion, 'candidates' | 'ballots' | 'seats' | 'title'>): string {
    return canonicalJson({
        format: 'lockpad-ballots',
        version: 1,
        engine: '1.0.0',
        title: '',
        notice: NOTICE_TEXT,
        questions: [{ ...question(), ...q, title: q.title }],
    })
}

describe('toBlt', () => {
    it('groups identical ballots under one weight', () => {
        expect(toBlt(question())).toBe(
            ['4 2', '6 1 2 3 0', '2 1 3 0', '4 2 0', '3 3 4 0', '1 4 0', '1 4 3 0', '0', '"A"', '"B"', '"C"', '"D"', '"Committee 2026"', ''].join(
                '\n'
            )
        )
    })

    it('leaves out informal ballots, which the format cannot hold', () => {
        expect(toBlt(question({ ballots: [[A], [], [A, A], [9]] }))).toContain('4 2\n1 1 0\n0\n')
    })

    it('writes a plurality ballot with its marks in order', () => {
        expect(toBlt(question({ method: 'plurality', ballots: [[C, A]] }))).toContain('\n1 1 3 0\n')
    })

    it('replaces double quotes in names', () => {
        expect(toBlt(question({ candidates: ['Ann "Annie" Lee', 'B', 'C', 'D'], ballots: [] }))).toContain(
            '"Ann “Annie” Lee"'
        )
    })
})

describe('parseBlt', () => {
    it('round-trips a question', () => {
        const parsed = parseBlt(toBlt(question()))

        expect(parsed.title).toBe('Committee 2026')
        expect(parsed.seats).toBe(2)
        expect(parsed.candidates).toEqual(['A', 'B', 'C', 'D'])
        expect(canonicalBallots(parsed)).toBe(canonicalBallots(question()))
    })

    it('expands a weight into repeated ballots', () => {
        expect(parseBlt('2 1\n3 2 1 0\n0\n"A"\n"B"\n"T"').ballots).toEqual([
            [B, A],
            [B, A],
            [B, A],
        ])
    })

    it('drops withdrawn candidates from the list and from every ballot', () => {
        const parsed = parseBlt('3 1\n-2\n1 1 2 3 0\n1 2 0\n0\n"A"\n"B"\n"C"\n"T"')

        expect(parsed.candidates).toEqual(['A', 'C'])
        expect(parsed.ballots).toEqual([[0, 1], []])
    })

    it('reads names with spaces and accents, composed or not, as the same name', () => {
        const composed = parseBlt('2 1\n1 1 0\n0\n"Renée Smith"\n"B"\n"T"')
        const decomposed = parseBlt('2 1\n1 1 0\n0\n"Renée Smith"\n"B"\n"T"')

        expect(composed.candidates[0]!.normalize('NFC')).toBe(decomposed.candidates[0]!.normalize('NFC'))
        expect(canonicalBallots(decomposed)).toBe(canonicalBallots(composed))
    })

    it('reads a file with a byte-order mark, CRLF line endings, blank lines and comments', () => {
        const parsed = parseBlt('﻿2 1\r\n\r\n# a comment\r\n2 1 2 0\r\n0\r\n"A" "B"\r\n"T"\r\n\r\n')

        expect(parsed).toEqual({ title: 'T', seats: 1, candidates: ['A', 'B'], ballots: [[A, B], [A, B]] })
    })

    it('reads .blt files as other counting programs write them', () => {
        const text = '2 1\n(b1) 1 1 2 0\n(b2) 2.0 2 0\n0\n"A" "B" "Title"\n"Written by OpenSTV"\n'

        expect(parseBlt(text)).toEqual({ title: 'Title', seats: 1, candidates: ['A', 'B'], ballots: [[A, B], [B], [B]] })
    })

    it('keeps a name block intact, whatever its lines start with', () => {
        expect(parseBlt('2 1\n1 1 0\n0\n"A"\n"#2 B"\n"T"').candidates).toEqual(['A', '#2 B'])
    })

    it('stays fast with many candidates and long ballots', () => {
        const names = Array.from({ length: 10_000 }, (_, i) => `"C${i}"`).join('\n')
        const preferences = Array.from({ length: 1000 }, (_, i) => i + 1).join(' ')
        const started = performance.now()
        const parsed = parseBlt(`10000 1\n-10000\n10000 ${preferences} 0\n0\n${names}\n"T"`)

        expect(parsed.ballots).toHaveLength(10_000)
        expect(performance.now() - started).toBeLessThan(2000)
    })

    it('keeps a ballot that repeats a candidate, as an informal ballot', () => {
        expect(parseBlt('2 1\n1 1 1 0\n0\n"A"\n"B"\n"T"').ballots).toEqual([[A, A]])
    })

    it.each([
        ['equal rankings', '2 1\n1 1=2 0\n0\n"A"\n"B"\n"T"', /equal rankings/],
        ['a fractional weight', '2 1\n1.5 1 0\n0\n"A"\n"B"\n"T"', /weight should be a whole number/],
        ['a zero weight', '2 1\n0 1 0\n0\n"A"\n"B"\n"T"', /weight should be a whole number/],
        ['a missing header', '', /should start with the number of candidates and seats/],
        ['a bad header', '2\n0\n"A"\n"B"\n"T"', /should start with the number of candidates and seats/],
        ['no seats', '2 0\n0\n"A"\n"B"\n"T"', /should start with the number of candidates and seats/],
        ['a candidate out of range', '2 1\n1 3 0\n0\n"A"\n"B"\n"T"', /Line 2: there is no candidate 3/],
        ['a ballot line without its closing 0', '2 1\n1 1 2\n0\n"A"\n"B"\n"T"', /Line 2: a ballot line should end with 0/],
        ['junk in a ballot line', '2 1\n1 1 x 0\n0\n"A"\n"B"\n"T"', /Line 2: "x" isn't a candidate number/],
        ['a withdrawn candidate out of range', '2 1\n-3\n1 1 0\n0\n"A"\n"B"\n"T"', /there is no candidate 3/],
        ['no end-of-ballots line', '2 1\n1 1 0', /no 0 line after the ballots/],
        ['too few names', '2 1\n1 1 0\n0\n"A"\n"T"', /2 candidate names and a title/],
        ['too many ballots', '2 1\n2000001 1 0\n0\n"A"\n"B"\n"T"', /more than 1,000,000 ballots/],
        ['too many preferences in all', `2 1\n900000 ${'1 '.repeat(30)}0\n0\n"A"\n"B"\n"T"`, /more than 20,000,000 preferences/],
        ['a weight with a fraction after the point', '2 1\n1.25 1 0\n0\n"A"\n"B"\n"T"', /weight should be a whole number/],
    ])('rejects %s', (_name, text, message) => {
        expect(() => parseBlt(text)).toThrow(BltError)
        expect(() => parseBlt(text)).toThrow(message)
    })
})
