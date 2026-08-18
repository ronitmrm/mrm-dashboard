import { readFileSync } from "node:fs"

import { describe, expect, test } from "vitest"

describe("attachment storage dependencies", () => {
  test("does not configure Vercel Blob or retain its dependency", () => {
    const files = [
      new URL("../package.json", import.meta.url),
      new URL("../.env.example", import.meta.url),
      new URL("../../../pnpm-lock.yaml", import.meta.url),
      new URL("../../../turbo.json", import.meta.url),
      new URL(
        "../../../docs/local-file-storage-backup-restore.md",
        import.meta.url
      ),
    ]
    const configuration = files
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")

    expect(configuration).not.toContain("@vercel/blob")
    expect(configuration).not.toContain("BLOB_READ_WRITE_TOKEN")
    expect(configuration).not.toMatch(/Vercel\s+Blob/i)
  })
})
