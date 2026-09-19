import { execFile, spawn } from "node:child_process"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import { generateBrandingPdf } from "../lib/branding/pdf"
import { brandingVerificationFixtures } from "../lib/branding/verification-fixtures"
import { parseBrandingContent } from "@workspace/db/branding-domain"

const execFileAsync = promisify(execFile)
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outputRoot = "/tmp/mrm-pdfkit-152"
const scriptPath = fileURLToPath(import.meta.url)

type RenderMetric = {
  fixture: string
  bytes: number
  rendererMs: number
  nodeRssBytes: number
  nodeMaxRssBytes: number
}

async function renderFixture(name: string, outputPath?: string) {
  const fixture = brandingVerificationFixtures.find(
    (candidate) => candidate.name === name
  )
  if (!fixture) throw new Error(`Unknown verification fixture: ${name}`)
  const { name: fixtureName, ...input } = fixture
  if (fixtureName !== name)
    throw new Error("Fixture lookup returned the wrong input.")
  const normalizedInput = {
    ...input,
    content: parseBrandingContent(input.content, input.type),
  }
  const start = performance.now()
  const bytes = await generateBrandingPdf(normalizedInput)
  const rendererMs = performance.now() - start
  if (outputPath) await writeFile(outputPath, bytes)
  return {
    fixture: name,
    bytes: bytes.byteLength,
    rendererMs,
    nodeRssBytes: process.memoryUsage().rss,
    nodeMaxRssBytes: process.resourceUsage().maxRSS * 1024,
  } satisfies RenderMetric
}

async function childMode(args: string[]) {
  if (args[0] === "render") {
    console.log(JSON.stringify(await renderFixture(args[1]!, args[2])))
    return true
  }
  if (args[0] === "repeat") {
    const rounds = Number(args[1] ?? 2)
    const metrics: RenderMetric[] = []
    for (let round = 0; round < rounds; round++)
      for (const fixture of brandingVerificationFixtures)
        metrics.push(await renderFixture(fixture.name))
    console.log(JSON.stringify(metrics))
    return true
  }
  return false
}

async function processTreeRssBytes(rootPid: number) {
  const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,rss="])
  const rows = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter((row) => row.length === 3 && row.every(Number.isFinite))
    .map(([pid, ppid, rss]) => ({ pid: pid!, ppid: ppid!, rss: rss! }))
  const descendants = new Set([rootPid])
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows)
      if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
        descendants.add(row.pid)
        changed = true
      }
  }
  return (
    rows
      .filter(({ pid }) => descendants.has(pid))
      .reduce((sum, { rss }) => sum + rss, 0) * 1024
  )
}

async function runMeasured(args: string[]) {
  const started = performance.now()
  const child = spawn(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", scriptPath, ...args],
    { cwd: appRoot, stdio: ["ignore", "pipe", "pipe"] }
  )
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk: Buffer) => (stdout += chunk))
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk))
  let peakTreeRssBytes = 0
  let pollInFlight = false
  const timer = setInterval(() => {
    if (pollInFlight) return
    pollInFlight = true
    void processTreeRssBytes(child.pid!)
      .then((rss) => (peakTreeRssBytes = Math.max(peakTreeRssBytes, rss)))
      .finally(() => (pollInFlight = false))
  }, 25)
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", resolve)
  })
  clearInterval(timer)
  if (exitCode !== 0)
    throw new Error(`Renderer child failed (${exitCode}): ${stderr || stdout}`)
  const json = stdout.trim().split("\n").at(-1)
  if (!json) throw new Error("Renderer child returned no metrics.")
  return {
    wallMs: performance.now() - started,
    peakTreeRssBytes,
    metrics: JSON.parse(json) as RenderMetric | RenderMetric[],
  }
}

type NftTrace = { version: number; files: string[] }

async function traceMetric(tracePath: string) {
  const trace = JSON.parse(await readFile(tracePath, "utf8")) as NftTrace
  const files = [
    ...new Set(
      trace.files.map((file) => path.resolve(path.dirname(tracePath), file))
    ),
  ]
  const existing = await Promise.all(
    files.map(async (file) => {
      try {
        return { file, bytes: (await stat(file)).size }
      } catch {
        return undefined
      }
    })
  )
  const present = existing.filter((entry) => entry !== undefined)
  const chromium = present.filter(({ file }) =>
    file.includes("@sparticuz/chromium/bin/")
  )
  return {
    trace: path.relative(appRoot, tracePath),
    files: trace.files.length,
    presentFiles: present.length,
    bytes: present.reduce((sum, entry) => sum + entry.bytes, 0),
    chromiumBytes: chromium.reduce((sum, entry) => sum + entry.bytes, 0),
    chromiumFiles: chromium.map(({ file, bytes }) => ({
      file: path.basename(file),
      bytes,
    })),
  }
}

async function main(label: string | undefined, includeTraces: boolean) {
  if (label !== "old-renderer" && label !== "new-renderer")
    throw new Error(
      "Choose an explicit old-renderer or new-renderer artifact label."
    )
  const rendererRoot = path.join(outputRoot, label)
  await mkdir(rendererRoot, { recursive: true })
  const fresh = []
  for (const fixture of brandingVerificationFixtures) {
    const outputPath = path.join(rendererRoot, `${fixture.name}.pdf`)
    fresh.push({
      outputPath,
      ...(await runMeasured(["render", fixture.name, outputPath])),
    })
  }
  const repeated = await runMeasured(["repeat", "2"])
  const tracePaths = [
    ".next/server/app/branding/page.js.nft.json",
    ".next/server/app/branding/[type]/page.js.nft.json",
    ".next/server/app/branding/[type]/[id]/page.js.nft.json",
    ".next/server/app/branding/[type]/[id]/preview/route.js.nft.json",
    ".next/server/app/branding/[type]/[id]/revisions/[revisionId]/pdf/route.js.nft.json",
  ].map((entry) => path.join(appRoot, entry))
  const traces = includeTraces
    ? await Promise.all(tracePaths.map(traceMetric))
    : []
  const result = {
    capturedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform },
    build: {
      kind: includeTraces
        ? "local Next.js production NFT traces; not Vercel function groups"
        : "Not captured; renderer-only run",
      traces,
    },
    freshProcess: fresh,
    repeatedProcess: repeated,
  }
  await writeFile(
    path.join(outputRoot, `${label}-baseline.json`),
    `${JSON.stringify(result, null, 2)}\n`
  )
  console.log(JSON.stringify(result, null, 2))
}

const args = process.argv.slice(2)
if (!(await childMode(args)))
  await main(args[0], args.includes("--include-build-traces"))
