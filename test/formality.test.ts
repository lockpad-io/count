import { describe, expect, it } from 'vitest'
import { isFormal } from '../src/formality.ts'
import type { ElectionQuestion, Method } from '../src/types.ts'

function question(method: Method, overrides: Partial<ElectionQuestion> = {}): ElectionQuestion {
    return {
        id: 'q1',
        kind: 'election',
        title: 'Committee',
        method,
        seats: 1,
        candidates: ['A', 'B', 'C', 'D'],
        minPreferences: 1,
        ballots: [],
        tieDecisions: [],
        ...overrides,
    }
}

describe('isFormal', () => {
    it('needs at least one preference', () => {
        expect(isFormal(question('irv'), [])).toBe(false)
        expect(isFormal(question('irv', { minPreferences: 0 }), [])).toBe(false)
    })

    it('refuses a repeated candidate', () => {
        expect(isFormal(question('irv'), [0, 0])).toBe(false)
    })

    it('refuses a candidate that does not exist', () => {
        expect(isFormal(question('irv'), [5])).toBe(false)
        expect(isFormal(question('irv'), [-1])).toBe(false)
        expect(isFormal(question('irv'), [1.5])).toBe(false)
    })

    it('limits a plurality ballot to one mark per seat', () => {
        expect(isFormal(question('plurality', { seats: 2 }), [0, 1, 2])).toBe(false)
        expect(isFormal(question('plurality', { seats: 2 }), [2, 0])).toBe(true)
    })

    it('accepts an optional preferential ballot with one preference', () => {
        expect(isFormal(question('irv', { minPreferences: 1 }), [2])).toBe(true)
        expect(isFormal(question('stv-wigm', { seats: 2 }), [3, 2, 1, 0])).toBe(true)
    })

    it('enforces the minimum number of preferences', () => {
        expect(isFormal(question('irv', { minPreferences: 3 }), [2])).toBe(false)
        expect(isFormal(question('irv', { minPreferences: 3 }), [2, 0, 1])).toBe(true)
    })
})
