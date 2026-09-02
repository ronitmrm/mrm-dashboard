import { defineConfig } from "vitest/config"
import { assertSafeTestDatabase } from "../../scripts/test-database-safety"

assertSafeTestDatabase()

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  test: {
    fileParallelism: false,
  },
})
