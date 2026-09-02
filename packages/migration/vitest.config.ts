import { defineConfig } from "vitest/config"
import { assertSafeTestDatabase } from "../../scripts/test-database-safety"

assertSafeTestDatabase()

export default defineConfig({
  test: {
    fileParallelism: false,
  },
})
