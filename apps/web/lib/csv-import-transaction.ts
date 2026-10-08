import "server-only"

import { withRepositoryTransaction } from "@workspace/db"
import { readAuthEnvironment } from "@/lib/auth/auth"

export function withCsvImportTransaction<T>(operation: () => Promise<T>) {
  return withRepositoryTransaction(
    { connectionString: readAuthEnvironment().connectionString },
    operation
  )
}
