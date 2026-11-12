import { describe, expect, it } from 'vitest'
import { CsvError, parseCsv, toCsv } from '../src/csv.ts'
import type { ElectionQuestion } from '../src/types.ts'

const [A, B, C] = [0, 1, 2]

const clean = ['A,"Smith, Jo",C', '1,2,', ',1,2', '2,,1'].join('\n')

describe('parseCsv, one column per candidate', () => {
    it('orders each row by its preference numbers', () => {
        expect(parseCsv(clean, 'preferences', 'stv-wigm')).toEqual({
            candidates: ['A', 'Smith, Jo', 'C'],
            ballots: [
                [A, B],
                [B, C],
                [C, A],
            ],
            rejectedRows: [],
        })
    })

    it('reads a spreadsheet export the same as clean input', () => {
        const messy = '﻿' + clean.split('\n').join('\r\n') + '\r\n\r\n\r\n'

        expect(parseCsv(messy, 'preferences', 'stv-wigm')).toEqual(parseCsv(clean, 'preferences', 'stv-wigm'))
    })

    it('reads quoted cells with doubled quotes and line breaks', () => {
        const parsed = parseCsv('"Ann ""Annie"" Lee","Bo\nBrown"\n1,2\n', 'preferences', 'irv')

        expect(parsed.candidates).toEqual(['Ann "Annie" Lee', 'Bo\nBrown'])
        expect(parsed.ballots).toEqual([[A, B]])
    })

    it('allows gaps in the numbering', () => {
        expect(parseCsv('A,B,C\n4,1,2', 'preferences', 'irv').ballots).toEqual([[B, C, A]])
    })

    it('ignores empty columns after the last candidate, as spreadsheets export them', () => {
        expect(parseCsv('A,B,,\n1,2,,\n2,1\n1,,3,', 'preferences', 'irv')).toEqual({
            candidates: ['A', 'B'],
            ballots: [[A, B], [B, A], []],
            rejectedRows: [4],
        })
    })

    it('trims spaces around numbers and names', () => {
        expect(parseCsv(' A , B \n 2 , 1 ', 'preferences', 'irv')).toMatchObject({
            candidates: ['A', 'B'],
            ballots: [[B, A]],
        })
    })

    it.each([
        ['a repeated number', 'A,B,C\n1,2,2'],
        ['a zero', 'A,B,C\n1,0,'],
        ['junk', 'A,B,C\n1,x,'],
        ['a fraction', 'A,B,C\n1,1.5,'],
        ['a mark beyond the last column', 'A,B,C\n1,,,2'],
    ])('rejects a row with %s, keeping it as an informal ballot', (_name, text) => {
        const parsed = parseCsv(`${text}\n2,1,`, 'preferences', 'irv')

        expect(parsed.ballots).toEqual([[], [B, A]])
        expect(parsed.rejectedRows).toEqual([2])
    })

    it('counts rows as a spreadsheet does, blank rows included', () => {
        expect(parseCsv('A,B\n1,2\n\n1,1\n,\n2,1', 'preferences', 'irv')).toEqual({
            candidates: ['A', 'B'],
            ballots: [[A, B], [], [B, A]],
            rejectedRows: [4],
        })
    })

    it('reads any mark as a vote for plurality', () => {
        expect(parseCsv('A,B,C\nX,,yes\n,1,', 'preferences', 'plurality').ballots).toEqual([[A, C], [B]])
    })

    it('reads checkbox and 1/0 exports for plurality, where an unticked box is no vote', () => {
        const parsed = parseCsv('A,B,C\nTRUE,FALSE,FALSE\n0,1,0\nfalse,No,true', 'preferences', 'plurality')

        expect(parsed.ballots).toEqual([[A], [B], [C]])
        expect(parsed.rejectedRows).toEqual([])
    })

    it('stays fast on a very wide row', () => {
        const header = Array.from({ length: 20_000 }, (_, i) => `C${i}`).join(',')
        const row = Array.from({ length: 20_000 }, (_, i) => i + 1).join(',')
        const started = performance.now()

        expect(parseCsv(`${header}\n${row}`, 'preferences', 'irv').ballots[0]).toHaveLength(20_000)
        expect(performance.now() - started).toBeLessThan(2000)
    })

    it('matches the columns to the candidates given, in any order', () => {
        const parsed = parseCsv('C, Renée ,A\n1,2,3', 'preferences', 'irv', ['A', 'Renée', 'C'])

        expect(parsed.candidates).toEqual(['A', 'Renée', 'C'])
        expect(parsed.ballots).toEqual([[C, B, A]])
    })

    it.each([
        ['an empty file', '', /no header row/],
        ['only blank lines', '\n\r\n', /no header row/],
        ['a column with no name', 'A,,C\n1,2,3', /Column 2 has no candidate name/],
        ['a name listed twice', 'A,B,A\n1,2,3', /"A" heads two columns/],
        ['an unterminated quote', 'A,"B\n1,2', /quote that never closes/],
    ])('refuses %s', (_name, text, message) => {
        expect(() => parseCsv(text, 'preferences', 'irv')).toThrow(CsvError)
        expect(() => parseCsv(text, 'preferences', 'irv')).toThrow(message)
    })

    it('refuses a column that is not one of the candidates given', () => {
        expect(() => parseCsv('A,D\n1,2', 'preferences', 'irv', ['A', 'B'])).toThrow(/"D" isn't one of the candidates/)
    })
})

describe('parseCsv, one column per rank', () => {
    const candidates = ['Alice', 'Bob', 'Carol']

    it('reads the names in rank order', () => {
        expect(parseCsv('First,Second,Third\nBob,Alice,\nCarol,,', 'ranked-names', 'irv', candidates)).toEqual({
            candidates,
            ballots: [[B, A], [C]],
            rejectedRows: [],
        })
    })

    it('skips blank ranks', () => {
        expect(parseCsv('1,2,3\n,Bob,Alice', 'ranked-names', 'irv', candidates).ballots).toEqual([[B, A]])
    })

    it('matches names however they are encoded or spaced', () => {
        const parsed = parseCsv('1,2\n Renée ,Bob', 'ranked-names', 'irv', ['Bob', 'Renée'])

        expect(parsed.ballots).toEqual([[1, 0]])
    })

    it('rejects a row with an unknown name', () => {
        const parsed = parseCsv('1,2\nBob,Dave\nAlice,', 'ranked-names', 'irv', candidates)

        expect(parsed.ballots).toEqual([[], [A]])
        expect(parsed.rejectedRows).toEqual([2])
    })

    it('rejects a row naming someone twice', () => {
        expect(parseCsv('1,2\nBob,Bob', 'ranked-names', 'irv', candidates).rejectedRows).toEqual([2])
    })

    it('collects candidates only from rows it accepts', () => {
        expect(parseCsv('1,2\nDave,Dave\nBob,Alice', 'ranked-names', 'irv')).toMatchObject({
            candidates: ['Bob', 'Alice'],
            rejectedRows: [2],
        })
    })

    it('collects the candidates from the rows when none are given', () => {
        expect(parseCsv('1,2\nBob,Alice\nCarol,Bob', 'ranked-names', 'irv')).toEqual({
            candidates: ['Bob', 'Alice', 'Carol'],
            ballots: [
                [0, 1],
                [2, 0],
            ],
            rejectedRows: [],
        })
    })
})

describe('toCsv', () => {
    function question(overrides: Partial<ElectionQuestion> = {}): ElectionQuestion {
        return {
            id: 'q1',
            kind: 'election',
            title: 'Committee',
            method: 'stv-wigm',
            seats: 2,
            candidates: ['A', 'Smith, Jo', 'Ann "Annie" Lee', ' D'],
            minPreferences: 1,
            ballots: [[2, 0], [1], [0, 1, 3], [], [9]],
            tieDecisions: [],
            ...overrides,
        }
    }

    it('writes one column per candidate, formal ballots only, in canonical order', () => {
        expect(toCsv(question())).toBe(
            'A,"Smith, Jo","Ann ""Annie"" Lee"," D"\r\n1,2,,3\r\n,1,,\r\n2,,1,\r\n'
        )
    })

    it('marks plurality votes with an X', () => {
        expect(toCsv(question({ method: 'plurality', ballots: [[3, 0]] }))).toContain('\r\nX,,,X\r\n')
    })

    it('round-trips', () => {
        const q = question()
        const parsed = parseCsv(toCsv(q), 'preferences', q.method)

        expect(parsed.candidates).toEqual(['A', 'Smith, Jo', 'Ann "Annie" Lee', 'D'])
        expect(parsed.ballots).toEqual([[0, 1, 3], [1], [2, 0]])
    })
})
