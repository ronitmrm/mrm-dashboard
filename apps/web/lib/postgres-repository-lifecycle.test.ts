import { expect, test } from "vitest"

import { withPostgresRepository } from "./postgres-repository-lifecycle"

test("waits for a PostgreSQL operation before closing its pool", async () => {
  const events: string[] = []
  let finishOperation!: () => void
  const pending = new Promise<void>((resolve) => {
    finishOperation = resolve
  })
  const repository = {
    async close() {
      events.push("close")
    },
  }

  const result = withPostgresRepository(repository, async () => {
    events.push("operation:start")
    await pending
    events.push("operation:done")
    return "saved"
  })

  await Promise.resolve()
  expect(events).toEqual(["operation:start"])
  finishOperation()
  await expect(result).resolves.toBe("saved")
  expect(events).toEqual(["operation:start", "operation:done", "close"])
})
