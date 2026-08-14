export async function executeBoundedImport<T>(
  rows: T[],
  operation: (row: T, index: number) => Promise<void>,
  concurrency: number,
) {
  const batchSize = Math.max(1, Math.floor(concurrency))

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize)
    const results = await Promise.allSettled(
      batch.map((row, index) => operation(row, offset + index)),
    )
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    )
    if (failure) throw failure.reason
  }
}
