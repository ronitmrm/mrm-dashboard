import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  chmod,
  copyFile,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseEnv, promisify } from "node:util"

import { readGoogleCloudArtifactEnvironment } from "../lib/google-cloud-artifact-provider"

const execFileAsync = promisify(execFile)
const team = "mrm-general"
const project = "mrm-dashboard"
const managedNames = [
  "GCS_PROJECT_ID",
  "GCS_BUCKET_NAME",
  "GCS_PROJECT_NUMBER",
  "GCS_WORKLOAD_IDENTITY_POOL_ID",
  "GCS_WORKLOAD_IDENTITY_PROVIDER_ID",
  "GCS_SERVICE_ACCOUNT_EMAIL",
  "VERCEL_OIDC_TOKEN",
] as const
type ManagedName = (typeof managedNames)[number]
type ManagedEnvironment = Record<ManagedName, string>

type RefreshDependencies = {
  now?: () => Date
  pullEnvironment?: (targetPath: string) => Promise<void>
  writeOutput?: (message: string) => void
}

function isPlaceholder(value: string) {
  return (
    value === "[SENSITIVE]" ||
    /^(?:<[^>]+>|change[-_ ]?me|placeholder|replace[-_ ]?with)/i.test(value)
  )
}

function tokenExpiry(token: string, now: Date) {
  const parts = token.split(".")
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("VERCEL_OIDC_TOKEN is not a valid Development token.")
  }
  let claims: Record<string, unknown>
  try {
    const parsed = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf8")
    ) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid claims")
    }
    claims = parsed as Record<string, unknown>
  } catch {
    throw new Error("VERCEL_OIDC_TOKEN is not a valid Development token.")
  }

  const expectedAudience = `https://vercel.com/${team}`
  const audience = claims.aud
  const audienceMatches =
    audience === expectedAudience ||
    (Array.isArray(audience) && audience.includes(expectedAudience))
  const expiresAtSeconds = claims.exp
  if (
    claims.iss !== `https://oidc.vercel.com/${team}` ||
    claims.sub !== `owner:${team}:project:${project}:environment:development` ||
    claims.owner !== team ||
    claims.project !== project ||
    claims.environment !== "development" ||
    !audienceMatches ||
    typeof expiresAtSeconds !== "number" ||
    !Number.isSafeInteger(expiresAtSeconds) ||
    expiresAtSeconds * 1000 <= now.getTime()
  ) {
    throw new Error("VERCEL_OIDC_TOKEN is not a valid Development token.")
  }
  return new Date(expiresAtSeconds * 1000)
}

function selectedEnvironment(content: string, now: Date) {
  let parsed: NodeJS.Dict<string>
  try {
    parsed = parseEnv(content)
  } catch {
    throw new Error("Vercel returned an invalid Development environment file.")
  }
  const values = {} as ManagedEnvironment
  for (const name of managedNames) {
    const value = parsed[name]?.trim()
    if (!value || isPlaceholder(value)) {
      throw new Error(`${name} is missing from Vercel Development.`)
    }
    values[name] = value
  }

  const configuration = readGoogleCloudArtifactEnvironment(values)
  if (configuration.workloadIdentity.kind !== "vercel-oidc") {
    throw new Error("Vercel Development OIDC configuration is unavailable.")
  }
  return {
    expiresAt: tokenExpiry(values.VERCEL_OIDC_TOKEN, now),
    values,
  }
}

function serializedValue(value: string) {
  return JSON.stringify(value)
}

export function mergeArtifactEnvironment(
  currentContent: string,
  values: ManagedEnvironment
) {
  const newline = currentContent.includes("\r\n") ? "\r\n" : "\n"
  const lines = currentContent ? currentContent.split(/\r?\n/) : []
  const found = new Set<ManagedName>()

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const match =
      /^(\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)(.*)$/.exec(line)
    const name = match?.[2] as ManagedName | undefined
    if (!name || !managedNames.includes(name)) continue
    const comment = /(\s+#.*)$/.exec(match![3]!)?.[1] ?? ""
    lines[index] = `${match![1]}${serializedValue(values[name])}${comment}`
    found.add(name)
  }

  if (lines.at(-1) === "") lines.pop()
  for (const name of managedNames) {
    if (!found.has(name)) lines.push(`${name}=${serializedValue(values[name])}`)
  }
  return `${lines.join(newline)}${newline}`
}

async function readOptional(path: string) {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return ""
    }
    throw error
  }
}

async function writeLocalEnvironment(path: string, content: string) {
  const pendingPath = `${path}.artifact-auth-${process.pid}-${randomUUID()}`
  try {
    await writeFile(pendingPath, content, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    })
    if (process.platform === "win32") {
      await copyFile(pendingPath, path)
    } else {
      await rename(pendingPath, path)
      await chmod(path, 0o600)
    }
  } finally {
    await rm(pendingPath, { force: true })
  }
}

async function pullVercelDevelopmentEnvironment(
  appDirectory: string,
  targetPath: string
) {
  const vercelArguments = [
    "env",
    "pull",
    targetPath,
    `--project=${project}`,
    `--scope=${team}`,
    "--environment=development",
    "--yes",
  ]
  let executable = "vercel"
  let arguments_ = vercelArguments
  if (process.platform === "win32") {
    // pnpm supplies its own entry point to this operator-only command.
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    const packageManagerPath = process.env.npm_execpath
    if (!packageManagerPath || !/\.(?:c?js|mjs)$/i.test(packageManagerPath)) {
      throw new Error(
        "Run this command through pnpm so the Vercel CLI can start on Windows."
      )
    }
    executable = process.execPath
    arguments_ = [packageManagerPath, "exec", "vercel", ...vercelArguments]
  }

  try {
    await execFileAsync(executable, arguments_, {
      cwd: appDirectory,
      maxBuffer: 256 * 1024,
      timeout: 60_000,
      windowsHide: true,
    })
  } catch {
    throw new Error(
      "Vercel Development environment pull failed. Log in with an authorized mrm-general account and retry."
    )
  }
}

export async function refreshArtifactOidcEnvironment(input?: {
  appDirectory?: string
  dependencies?: RefreshDependencies
}) {
  const appDirectory =
    input?.appDirectory ?? fileURLToPath(new URL("..", import.meta.url))
  const dependencies = input?.dependencies ?? {}
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "mrm-artifact-oidc-"))
  try {
    if (process.platform !== "win32") {
      await chmod(temporaryDirectory, 0o700)
    }
    const pulledPath = join(temporaryDirectory, "development.env")
    const pullEnvironment =
      dependencies.pullEnvironment ??
      ((path) => pullVercelDevelopmentEnvironment(appDirectory, path))
    await pullEnvironment(pulledPath)
    const selected = selectedEnvironment(
      await readFile(pulledPath, "utf8"),
      dependencies.now?.() ?? new Date()
    )
    const localPath = join(appDirectory, ".env.local")
    const merged = mergeArtifactEnvironment(
      await readOptional(localPath),
      selected.values
    )
    await writeLocalEnvironment(localPath, merged)

    const writeOutput =
      dependencies.writeOutput ??
      ((message: string) => process.stdout.write(message))
    writeOutput(
      `Artifact OIDC credentials refreshed; Development token expires ${selected.expiresAt.toISOString()}. Restart the local dev server.\n`
    )
    return { expiresAt: selected.expiresAt }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true })
  }
}

const entryPoint = process.argv[1]
if (entryPoint && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  refreshArtifactOidcEnvironment().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error."
    process.stderr.write(`Artifact OIDC refresh failed: ${message}\n`)
    process.exitCode = 1
  })
}
