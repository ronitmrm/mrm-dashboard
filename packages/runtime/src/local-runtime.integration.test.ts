import { describe, expect, it } from "vitest"

import { verifyLocalRuntime } from "./local-runtime"

const postgresUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test"
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://localhost:6380"

describe("local unified runtime", () => {
  it("starts from empty PostgreSQL and reaches Redis without making Redis authoritative", async () => {
    await expect(
      verifyLocalRuntime({ postgresUrl, redisUrl })
    ).resolves.toMatchObject({
      migrationsApplied: expect.any(Number),
      postgres: "ready",
      redis: "ready"
    })
  })
})
