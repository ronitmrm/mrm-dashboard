import { expect, test } from "vitest"
import {
  repositoryPool,
  withRepositoryTransaction,
  withTransaction,
} from "./postgres-runtime"

test("commits the complete upload and rolls back every row when row 20 fails", async () => {
  const connectionString =
    process.env.TEST_DATABASE_URL ??
    "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
  const options = { connectionString }
  const observer = repositoryPool(options)
  await observer.pool.query(
    "CREATE TABLE public.csv_transaction_test (id integer PRIMARY KEY)"
  )
  const upload = (ids: number[]) =>
    withRepositoryTransaction(options, async () => {
      const first = repositoryPool(options)
      const second = repositoryPool(options)
      for (const id of ids) {
        // Both repository queries and their existing row transactions join the upload.
        await withTransaction(first.pool, async (client) => {
          await client.query(
            "INSERT INTO public.csv_transaction_test VALUES ($1)",
            [id]
          )
        })
      }
      const pending = await second.pool.query("SELECT id FROM public.csv_transaction_test")
      const visible = await observer.pool.query("SELECT id FROM public.csv_transaction_test")
      expect(pending.rowCount).toBe(ids.length)
      expect(visible.rowCount).toBe(0)
      await first.close()
      await second.close()
    })
  try {
    await expect(
      upload([...Array.from({ length: 19 }, (_, index) => index + 1), 19])
    ).rejects.toThrow(/duplicate key/)
    expect(
      (
        await observer.pool.query(
          "SELECT id FROM public.csv_transaction_test ORDER BY id"
        )
      ).rows
    ).toEqual([])
    await upload(Array.from({ length: 20 }, (_, index) => index + 1))
    expect(
      (await observer.pool.query("SELECT id FROM public.csv_transaction_test"))
        .rowCount
    ).toBe(20)
  } finally {
    await observer.pool.query("DROP TABLE public.csv_transaction_test")
    await observer.close()
  }
})
