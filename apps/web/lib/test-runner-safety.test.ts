import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { expect, test } from "vitest"

const require = createRequire(import.meta.url)
const vitest = join(
  dirname(require.resolve("vitest/package.json")),
  "vitest.mjs"
)
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

test.each([
  [
    "apps/web",
    "postgresql://fixture:do-not-log@production.example.test/neondb",
  ],
  [
    "packages/db",
    "postgresql://fixture:do-not-log@production.example.test/neondb",
  ],
  [
    "packages/migration",
    "postgresql://fixture:do-not-log@production.example.test/neondb",
  ],
  [
    "packages/runtime",
    "postgresql://fixture:do-not-log@production.example.test/neondb",
  ],
  [
    "apps/web",
    "postgresql://fixture:do-not-log@localhost/mrmpl_test?host=production.example.test",
  ],
  [
    "apps/web",
    "postgresql://fixture:do-not-log@localhost/mrmpl_test?database=neondb",
  ],
  [
    "apps/web",
    "postgresql://fixture:do-not-log@production.example.test/mrmpl_test",
  ],
])(
  "%s rejects an unsafe database before loading fixtures (%s)",
  (project, connectionString) => {
    const directory = mkdtempSync(join(tmpdir(), "mrm-test-guard-"))
    const marker = join(directory, "fixture-loaded")
    try {
      writeFileSync(
        join(directory, "probe.test.ts"),
        `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "loaded");\nthrow new Error("Fixture loaded before database validation");`
      )
      const result = spawnSync(
        process.execPath,
        [
          vitest,
          "run",
          "--config",
          join(workspace, project, "vitest.config.ts"),
          "--root",
          directory,
        ],
        {
          cwd: workspace,
          encoding: "utf8",
          timeout: 15_000,
          env: {
            ...process.env,
            DATABASE_URL:
              "postgresql://fixture:do-not-log@production-pooler.example.test/neondb",
            TEST_DATABASE_URL: connectionString,
            TEST_DATABASE_ALLOWED_HOST: "production.example.test",
          },
        }
      )
      expect(existsSync(marker)).toBe(false)
      expect(result.status).not.toBe(0)
      expect(result.stdout + result.stderr).toContain("Unsafe test database")
      expect(result.stdout + result.stderr).not.toContain("do-not-log")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
  20_000
)
