type ClosableRepository = {
  close: () => Promise<void>
}

export async function withPostgresRepository<
  Repository extends ClosableRepository,
  Result,
>(
  repository: Repository,
  operation: (repository: Repository) => Promise<Result>
) {
  try {
    return await operation(repository)
  } finally {
    await repository.close()
  }
}
