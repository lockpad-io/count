import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../src/sha256.ts'

describe('sha256Hex', () => {
    it('matches the FIPS 180-4 test vectors', () => {
        expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
        expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    })

    it('hashes UTF-8 bytes', () => {
        expect(sha256Hex('abc123\nkookaburra')).toBe(
            '2e2337c1c60bb9752525d72807629f61f1db6b8bcb37d1779bb2647f8a3f1293'
        )
        expect(sha256Hex('é🦘')).toBe(createHash('sha256').update('é🦘', 'utf8').digest('hex'))
    })

    it.each([55, 56, 63, 64, 65, 119, 120])('pads a %i-byte message correctly', length => {
        const text = 'x'.repeat(length)

        expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
    })

    it('matches Node over a 1 MB string', () => {
        let text = ''
        for (let i = 0; text.length < 1_000_000; i++) {
            text += `${i},é;`
        }

        expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
    })
})
