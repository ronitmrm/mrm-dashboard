import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { validateManagedStagingEnvelope } from "../managed-staging-envelope"

function argument(name: string) {
  const equals = process.argv.find((value) => value.startsWith(`${name}=`))
  if (equals) return equals.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (!process.argv.includes("--redacted")) {
  throw new Error("Managed staging envelope recording requires --redacted")
}

const inputArgument = argument("--input")
const outputArgument = argument("--output")
if (!inputArgument || !outputArgument) {
  throw new Error("Both --input and --output are required")
}

const inputPath = resolve(inputArgument)
const outputPath = resolve(outputArgument)
if (inputPath === outputPath) {
  throw new Error("--input and --output must be different files")
}

const input = JSON.parse(await readFile(inputPath, "utf8")) as unknown
const { record, recordDigest } = await validateManagedStagingEnvelope(input)
await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
})
process.stdout.write(
  `${JSON.stringify({
    event: "managed-staging-envelope.recorded",
    output: outputPath,
    recordDigest,
    redacted: true,
    status: "passed",
  })}\n`
)
