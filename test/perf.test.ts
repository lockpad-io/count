import { expect, it } from 'vitest'
import { countStvWigm } from '../src/stv-wigm.ts'

/** A small seeded generator, so the ballots are the same on every run. */
function generator(seed: number): () => number {
    let state = seed
    return () => {
        state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
        return state / 2_147_483_648
    }
}

it('counts 3,000 ballots, 20 candidates and 7 seats by STV in under 2 seconds', () => {
    const random = generator(42)
    const ballots = Array.from({ length: 3000 }, () => {
        const order = Array.from({ length: 20 }, (_, i) => i)
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1))
            ;[order[i], order[j]] = [order[j]!, order[i]!]
        }
        return order.slice(0, 1 + Math.floor(random() * 20))
    })

    const started = performance.now()
    const result = countStvWigm({
        id: 'perf',
        kind: 'election',
        title: 'Performance',
        method: 'stv-wigm',
        seats: 7,
        candidates: Array.from({ length: 20 }, (_, i) => `C${i}`),
        minPreferences: 1,
        ballots,
        tieDecisions: [],
    })
    const elapsed = performance.now() - started

    expect(result.formal).toBe(3000)
    expect(result.elected.length + (result.status === 'tie-unresolved' ? 1 : 0)).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(2000)
})
