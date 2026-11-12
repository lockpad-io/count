import { sha256Hex } from './sha256.ts'
import { asciiTrim } from './text.ts'
import type { TieKind } from './types.ts'

/**
 * The seeded draw for a tie countback couldn't break. Anyone can recompute it: SHA-256 of the
 * ballots hash, question id, round, kind, the tied candidates (comma-separated) and the
 * witness's value, one per line, read as a number modulo the size of the tie, picks from
 * `tied`. The value is entered once per tie and reused for every decision that tie needs; the
 * tied set in the seed makes each of those draws independent.
 */
export function drawCandidate(
    ballotsHash: string,
    questionId: string,
    round: number,
    kind: TieKind,
    witnessValue: string,
    tied: readonly number[]
): number {
    const value = asciiTrim(witnessValue.normalize('NFC'))
    if (value === '') {
        throw new RangeError('A draw needs the witness value.')
    }
    if (tied.length < 2) {
        throw new RangeError('A draw needs at least two tied candidates.')
    }

    const seed = [ballotsHash, questionId.normalize('NFC'), String(round), kind, tied.join(','), value].join('\n')

    return tied[Number(BigInt(`0x${sha256Hex(seed)}`) % BigInt(tied.length))]!
}
