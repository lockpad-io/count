/**
 * Vote values are fixed-point integers: 1 vote is SCALE units, so 6 decimal places, identical in
 * every JavaScript engine. A multiplication followed by a division truncates toward zero.
 */
export type Fixed = bigint

export const SCALE: Fixed = 1_000_000n

const PLACES = 6

/** A whole number of votes. Throws unless `n` is a safe integer. */
export function fixed(n: number): Fixed {
    if (!Number.isSafeInteger(n)) {
        throw new RangeError(`Expected a whole number of votes, got ${n}`)
    }

    return BigInt(n) * SCALE
}

/** trunc(a × b / c). */
export function mulDiv(a: Fixed, b: Fixed, c: Fixed): Fixed {
    return (a * b) / c
}

/** Exactly 6 decimal places, such as "5.500000" or "-0.000001". */
export function format(v: Fixed): string {
    const sign = v < 0n ? '-' : ''
    const magnitude = v < 0n ? -v : v

    return `${sign}${magnitude / SCALE}.${(magnitude % SCALE).toString().padStart(PLACES, '0')}`
}
