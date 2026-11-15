// One-time cutover: copy every retained Google Cloud file onto the server disk,
// verify each against its recorded SHA-256, then mark the rows as local-disk.
//
//   --mode=copy    download missing files (safe to re-run; skips verified ones)
//   --mode=switch  re-verify every file on disk, then flip provider in one transaction
//
// Needs MIGRATION_DATABASE_URL, ARTIFACT_STORAGE_DIRECTORY, GCS_* and a fresh
// production VERCEL_OIDC_TOKEN (`vercel env pull --environment=production`).
import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { Pool } from "pg"

import { createGoogleCloudArtifactProvider } from "../lib/google-cloud-artifact-provider"

type StoredObject = { byteSize: number; key: string; sha256: string }

const mode = process.argv.find((value) => value.startsWith("--mode="))?.slice(7)
const keyPattern = /^artifacts\/[0-9a-f]{64}$/

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function matches(bytes: Buffer, object: StoredObject) {
  return (
    bytes.byteLength === object.byteSize &&
    createHash("sha256").update(bytes).digest("hex") === object.sha256
  )
}

async function readLocal(root: string, object: StoredObject) {
  return readFile(path.join(root, object.key)).catch(() => null)
}

async function main() {
  if (mode !== "copy" && mode !== "switch") {
    throw new Error("Pass --mode=copy or --mode=switch.")
  }
  const root = required("ARTIFACT_STORAGE_DIRECTORY")
  const pool = new Pool({
    connectionString: required("MIGRATION_DATABASE_URL"),
  })
  try {
    const { rows } = await pool.query<StoredObject>(`
      SELECT provider_key AS key, sha256, byte_size::int AS "byteSize"
      FROM core.file_objects
      WHERE provider = 'google-cloud-storage' AND lifecycle_state = 'available'
      ORDER BY created_at
    `)
    const invalid = rows.filter((object) => !keyPattern.test(object.key))
    if (invalid.length > 0) {
      throw new Error(`${invalid.length} objects have unexpected keys.`)
    }

    if (mode === "copy") {
      const source = createGoogleCloudArtifactProvider(process.env)
      let copied = 0
      let skipped = 0
      const failed: string[] = []
      for (const object of rows) {
        const existing = await readLocal(root, object)
        if (existing && matches(existing, object)) {
          skipped += 1
          continue
        }
        try {
          const bytes = await source.read({ key: object.key })
          if (!matches(bytes, object)) throw new Error("checksum mismatch")
          const destination = path.join(root, object.key)
          await mkdir(path.dirname(destination), { recursive: true })
          await writeFile(`${destination}.copy`, bytes, { flag: "w" })
          await rename(`${destination}.copy`, destination)
          copied += 1
        } catch (error) {
          failed.push(`${object.key}: ${(error as Error).message}`)
        }
      }
      console.log(
        JSON.stringify({ copied, failed, skipped, total: rows.length })
      )
      if (failed.length > 0) process.exitCode = 2
      return
    }

    const missing: string[] = []
    for (const object of rows) {
      const bytes = await readLocal(root, object)
      if (!bytes || !matches(bytes, object)) missing.push(object.key)
    }
    if (missing.length > 0) {
      console.log(JSON.stringify({ missingOrMismatched: missing }))
      process.exitCode = 2
      return
    }
    const switched = await pool.query(
      `
      UPDATE core.file_objects
      SET provider = 'local-disk', updated_at = now()
      WHERE provider = 'google-cloud-storage' AND lifecycle_state = 'available'
        AND provider_key = ANY($1::text[])
    `,
      [rows.map((object) => object.key)]
    )
    console.log(
      JSON.stringify({ switched: switched.rowCount, verified: rows.length })
    )
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(`Artifact copy failed: ${(error as Error).message}`)
  process.exitCode = 1
})
