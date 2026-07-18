import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "./schema"

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString })
  const database = drizzle(pool, { schema })

  return {
    close: () => pool.end(),
    database,
  }
}
