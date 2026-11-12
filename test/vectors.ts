import { readdirSync, readFileSync } from 'node:fs'

const directory = new URL('../vectors/', import.meta.url)

/** Every stored vector: a ballot file and the exact output countFile must give for it. */
export const vectors = readdirSync(directory)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => ({
        name,
        ...(JSON.parse(readFileSync(new URL(name, directory), 'utf8')) as { file: unknown; output: unknown }),
    }))
