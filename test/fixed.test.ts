import { describe, expect, it } from 'vitest'
import { SCALE, fixed, format, mulDiv } from '../src/fixed.ts'

describe('fixed point', () => {
    it('scales whole numbers to six decimal places', () => {
        expect(SCALE).toBe(1_000_000n)
        expect(format(fixed(8))).toBe('8.000000')
        expect(format(fixed(0))).toBe('0.000000')
    })

    it('multiplies then divides', () => {
        expect(format(mulDiv(fixed(1), fixed(2), fixed(8)))).toBe('0.250000')
    })

    it('truncates toward zero', () => {
        expect(format(mulDiv(fixed(1), fixed(1), fixed(3)))).toBe('0.333333')
        expect(format(mulDiv(fixed(-1), fixed(1), fixed(3)))).toBe('-0.333333')
    })

    it('refuses anything but a safe integer', () => {
        expect(() => fixed(1.5)).toThrow(RangeError)
        expect(() => fixed(2 ** 53)).toThrow(RangeError)
        expect(() => fixed(Number.NaN)).toThrow(RangeError)
    })

    it('formats negatives with a sign', () => {
        expect(format(-1n)).toBe('-0.000001')
        expect(format(-fixed(3))).toBe('-3.000000')
    })
})
