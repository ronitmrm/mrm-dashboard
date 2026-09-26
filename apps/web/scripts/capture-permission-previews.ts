/* eslint-disable turbo/no-undeclared-env-vars -- Run manually against a local app. */
import { execFileSync } from "node:child_process"
import {
  mkdir,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises"
import path from "node:path"

import pg from "pg"
import sharp from "sharp"

import { permissionAccessRows } from "../app/administration/access/permission-access"
import { permissionPreview } from "../app/administration/access/permission-preview"
import { apiOnlyPermissionKeys } from "../lib/auth/page-access-catalog"

const databaseUrl = process.env.DATABASE_URL
const session = process.env.AGENT_BROWSER_SESSION
const baseUrl =
  process.env.PERMISSION_PREVIEW_BASE_URL ?? "http://localhost:3001"
if (!databaseUrl || !session) {
  throw new Error("DATABASE_URL and AGENT_BROWSER_SESSION are required")
}
if (!new URL(baseUrl).hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
  throw new Error("Capture previews from a local app only")
}

function browser(...args: string[]) {
  return execFileSync(
    "rtk",
    ["proxy", "agent-browser", "--session", session!, ...args],
    {
      encoding: "utf8",
      timeout: 90_000,
    }
  )
}

async function trimEmptyBottom(output: string) {
  const { data, info } = await sharp(output)
    .raw()
    .toBuffer({ resolveWithObject: true })
  let lastContentRow = info.height - 1
  for (let y = info.height - 1; y >= 0; y -= 1) {
    const rowStart = y * info.width * info.channels
    const first = [data[rowStart], data[rowStart + 1], data[rowStart + 2]]
    let hasContent = false
    for (let x = 8; x < info.width; x += 8) {
      const pixel = rowStart + x * info.channels
      if (
        Math.abs(data[pixel]! - first[0]!) > 8 ||
        Math.abs(data[pixel + 1]! - first[1]!) > 8 ||
        Math.abs(data[pixel + 2]! - first[2]!) > 8
      ) {
        hasContent = true
        break
      }
    }
    if (hasContent) {
      lastContentRow = y
      break
    }
  }
  const height = Math.min(info.height, lastContentRow + 24)
  if (info.height - height < 80) return false
  const temporary = `${output}.trimmed`
  await sharp(output)
    .extract({ left: 0, top: 0, width: info.width, height })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(temporary)
  await rename(temporary, output)
  return true
}

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()

try {
  const { rows: permissions } = await client.query<{
    key: string
    module: string
    name: string
  }>("SELECT key, module, name FROM identity.permissions ORDER BY key")
  const rows = permissionAccessRows(permissions)
  const missing: string[] = []
  const apiOnlyKeys = new Set<string>()
  const targets = new Map<
    string,
    { href: string; selector?: string; tab?: string }
  >()
  const coveredKeys = new Set<string>()

  for (const row of rows) {
    for (const action of row.actions) {
      const preview = permissionPreview(row, action)
      if (!preview) {
        if (
          action.permissionKeys.every((key) => apiOnlyPermissionKeys.has(key))
        ) {
          action.permissionKeys.forEach((key) => apiOnlyKeys.add(key))
        } else {
          missing.push(`${row.id}: ${action.permissionKeys.join(", ")}`)
        }
        continue
      }
      targets.set(preview.src, preview)
      action.permissionKeys.forEach((key) => coveredKeys.add(key))
    }
  }
  if (missing.length) {
    throw new Error(`Missing preview targets:\n${missing.join("\n")}`)
  }

  const outputDir = path.join(process.cwd(), "public", "permission-previews")
  await mkdir(outputDir, { recursive: true })
  const failures: string[] = []
  let captured = 0
  let skipped = 0
  let trimmed = 0
  const limit = Number(
    process.argv
      .find((argument) => argument.startsWith("--limit="))
      ?.split("=")[1] ?? targets.size
  )
  const match = process.argv
    .find((argument) => argument.startsWith("--match="))
    ?.slice("--match=".length)
  browser("set", "viewport", "1440", "900")

  for (const [src, target] of [...targets]
    .filter(([, target]) => !match || target.href.includes(match))
    .slice(0, limit)) {
    const { href, selector, tab } = target
    const output = path.join(outputDir, path.basename(src))
    if (!process.argv.includes("--force")) {
      try {
        if ((await stat(output)).size > 8_000) {
          if (
            process.argv.includes("--trim") &&
            (await trimEmptyBottom(output))
          ) {
            trimmed += 1
          }
          skipped += 1
          continue
        }
      } catch {
        // Capture missing images.
      }
    }

    try {
      const opened = browser("open", new URL(href, baseUrl).toString())
      const actual = opened.match(/https?:\/\/[^\s]+/)?.[0]
      const requested = new URL(href, baseUrl)
      if (
        actual &&
        (new URL(actual).pathname !== requested.pathname ||
          [...requested.searchParams].some(
            ([key, value]) => new URL(actual).searchParams.get(key) !== value
          ))
      ) {
        throw new Error(`redirected to ${actual}`)
      }
      browser(
        "wait",
        "--fn",
        "Boolean(document.querySelector('main')) && !document.querySelector('main [data-slot=\"skeleton\"]') && !document.querySelector('main')?.innerText.includes('Loading breaks') && document.querySelector('main')?.innerText.trim().length > 50"
      )
      if (tab) {
        const clicked = browser(
          "eval",
          `(() => { const tab = [...document.querySelectorAll('nav[aria-label="Asset Workspace sections"] button')].find((button) => button.textContent?.trim() === ${JSON.stringify(tab)}); if (!tab) return false; tab.click(); return true })()`
        )
        if (!clicked.includes("true")) throw new Error(`missing ${tab} tab`)
        browser(
          "wait",
          "--fn",
          `Boolean(document.querySelector('section[aria-label="${tab.toLowerCase()} section"]'))`
        )
      }
      const text = browser(
        "eval",
        "document.querySelector('main')?.innerText?.slice(0, 2500) ?? ''"
      )
      if (
        /Dashboard Unavailable|This page couldn.t load|Unauthorized|Page not found/i.test(
          text
        )
      ) {
        throw new Error(`screen did not render: ${text.slice(0, 160)}`)
      }
      browser(
        "screenshot",
        selector ?? "main",
        output,
        "--screenshot-format",
        "jpeg",
        "--screenshot-quality",
        "78"
      )
      if ((await stat(output)).size <= 8_000) {
        throw new Error("screenshot is unexpectedly small")
      }
      if (await trimEmptyBottom(output)) trimmed += 1
      captured += 1
      if (captured % 10 === 0) {
        process.stdout.write(`Captured ${captured}/${targets.size} screens\n`)
      }
    } catch (error) {
      failures.push(
        `${href}: ${error instanceof Error ? error.message : error}`
      )
      process.stderr.write(`Failed ${href}\n`)
    }
  }

  const missingFiles: string[] = []
  for (const src of targets.keys()) {
    try {
      if (
        (await stat(path.join(outputDir, path.basename(src)))).size <= 8_000
      ) {
        missingFiles.push(src)
      }
    } catch {
      missingFiles.push(src)
    }
  }
  let pruned = 0
  if (process.argv.includes("--prune") && missingFiles.length === 0) {
    for (const file of await readdir(outputDir)) {
      if (
        file.endsWith(".jpg") &&
        !targets.has(`/permission-previews/${file}`)
      ) {
        await unlink(path.join(outputDir, file))
        pruned += 1
      }
    }
  }

  const report = {
    registeredPermissions: permissions.length,
    displayedRows: rows.length,
    coveredKeys: coveredKeys.size,
    apiOnlyKeys: [...apiOnlyKeys].sort(),
    screenshotTargets: targets.size,
    captured,
    skipped,
    trimmed,
    missingFiles,
    pruned,
    failures,
  }
  await writeFile(
    "/tmp/mrm-permission-preview-report.json",
    JSON.stringify(report, null, 2)
  )
  process.stdout.write(`${JSON.stringify(report)}\n`)
  if (failures.length || missingFiles.length) process.exitCode = 1
} finally {
  await client.end()
}
