import { describe, expect, it } from 'vitest'
import { countResolution } from '../src/resolution.ts'
import type { ResolutionQuestion } from '../src/types.ts'

type Answer = ResolutionQuestion['ballots'][number]

function answers(forCount: number, against: number, abstain: number): Answer[] {
    return [
        ...Array<Answer>(forCount).fill('for'),
        ...Array<Answer>(against).fill('against'),
        ...Array<Answer>(abstain).fill('abstain'),
    ]
}

function question(ballots: Answer[], overrides: Partial<ResolutionQuestion> = {}): ResolutionQuestion {
    return {
        id: 'r1',
        kind: 'resolution',
        title: 'Special resolution',
        motion: 'Adopt the new rules',
        threshold: { rule: 'at-least', numerator: 3, denominator: 4 },
        base: 'for-against',
        ballots,
        ...overrides,
    }
}

describe('countResolution', () => {
    const ballots = answers(15, 4, 1)

    it('counts for and against as the base', () => {
        expect(countResolution(question(ballots))).toEqual({
            kind: 'resolution',
            questionId: 'r1',
            for: 15,
            against: 4,
            abstain: 1,
            base: 19,
            required: { rule: 'at-least', numerator: 3, denominator: 4 },
            carried: true,
        })
    })

    it('counts every ballot as the base, carrying exactly at the threshold', () => {
        const result = countResolution(question(ballots, { base: 'all-ballots' }))

        expect(result.base).toBe(20)
        expect(result.carried).toBe(true)
    })

    it('uses a fixed base', () => {
        const result = countResolution(question(ballots, { base: { fixed: 21 } }))

        expect(result.base).toBe(21)
        expect(result.carried).toBe(false)
    })

    it('needs more than the threshold for a more-than rule', () => {
        const result = countResolution(
            question(answers(10, 10, 0), { threshold: { rule: 'more-than', numerator: 1, denominator: 2 } })
        )

        expect(result.carried).toBe(false)
        expect(
            countResolution(question(answers(11, 10, 0), { threshold: { rule: 'more-than', numerator: 1, denominator: 2 } }))
                .carried
        ).toBe(true)
    })

    it('never carries on a base of zero', () => {
        expect(countResolution(question(answers(0, 0, 3))).carried).toBe(false)
        expect(countResolution(question([], { threshold: { rule: 'at-least', numerator: 0, denominator: 1 } })).carried).toBe(
            false
        )
    })
})
