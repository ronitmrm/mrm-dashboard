import { verifyLocalRuntime } from "../local-runtime"

const postgresUrl =
  process.env.DATABASE_URL ??
  "postgres://mrmpl:mrmpl@localhost:5434/mrmpl"
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6380"

const status = await verifyLocalRuntime({ postgresUrl, redisUrl })
process.stdout.write(`${JSON.stringify(status)}\n`)
