import { runCli } from './index.ts'

const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
const { stdout, exitCode } = runCli(Buffer.concat(chunks).toString('utf8'))
process.stdout.write(stdout)
process.exitCode = exitCode
