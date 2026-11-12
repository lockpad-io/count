import { describe, expect, it } from 'vitest'
import { asciiTrim, compareLists, compareText } from '../src/text.ts'

describe('asciiTrim', () => {
    it('trims spaces, tabs, CRs and LFs only', () => {
        expect(asciiTrim(' \t\r\nkookaburra \n')).toBe('kookaburra')
        expect(asciiTrim(' kookaburra ')).toBe(' kookaburra ')
        expect(asciiTrim('a b')).toBe('a b')
        expect(asciiTrim(' \t ')).toBe('')
        expect(asciiTrim('')).toBe('')
    })

    it('stays linear on long runs of whitespace', () => {
        const started = performance.now()
        asciiTrim(`x${' '.repeat(300_000)}x`)
        asciiTrim(' '.repeat(300_000))

        expect(performance.now() - started).toBeLessThan(200)
    })
})

describe('compareLists', () => {
    it('compares element by element, a shorter prefix first', () => {
        expect(compareLists([2], [10])).toBe(-1)
        expect(compareLists([10], [2])).toBe(1)
        expect(compareLists([1], [1, 0])).toBeLessThan(0)
        expect(compareLists([1, 0], [1])).toBeGreaterThan(0)
        expect(compareLists([1, 2], [1, 2])).toBe(0)
    })
})

describe('compareText', () => {
    it('compares by code unit', () => {
        expect(compareText('elect', 'exclude')).toBe(-1)
        expect(compareText('surplus-order', 'exclude')).toBe(1)
        expect(compareText('Z', 'a')).toBe(-1)
        expect(compareText('a', 'a')).toBe(0)
    })
})
