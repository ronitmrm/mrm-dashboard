import { migrateDatabase } from "@workspace/db"
import { Pool } from "pg"
import { createClient } from "redis"

type VerifyLocalRuntimeOptions = {
  postgresUrl: string
  redisUrl: string
}

export async function verifyLocalRuntime({
  postgresUrl,
  redisUrl
}: VerifyLocalRuntimeOptions) {
  await migrateDatabase({ connectionString: postgresUrl })

  const pool = new Pool({ connectionString: postgresUrl, max: 1 })
  const redis = createClient({ url: redisUrl })

  try {
    const migrations = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM migration.schema_migrations"
    )
    await redis.connect()
    const pong = await redis.ping()

    if (pong !== "PONG") {
      throw new Error("Redis health check did not return PONG")
    }

    return {
      migrationsApplied: Number(migrations.rows[0]?.count ?? 0),
      postgres: "ready" as const,
      redis: "ready" as const
    }
  } finally {
    if (redis.isOpen) {
      await redis.close()
    }
    await pool.end()
  }
}
