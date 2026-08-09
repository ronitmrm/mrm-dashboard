import {
  withPerformanceOperation,
  type TelemetryRuntime,
  type TelemetrySink,
} from "@workspace/observability"

type ClosableRepository = {
  close: () => Promise<void>
}

type RepositoryOperationTelemetry = {
  operation: string
  requestId?: string
  runtime?: TelemetryRuntime
  sink?: TelemetrySink
  subsystem: string
}

export async function withPostgresRepository<
  Repository extends ClosableRepository,
  Result,
>(
  repository: Repository,
  operation: (repository: Repository) => Promise<Result>,
  telemetry?: RepositoryOperationTelemetry
) {
  const execute = async () => {
    try {
      return await operation(repository)
    } finally {
      await repository.close()
    }
  }

  if (!telemetry) return execute()
  return withPerformanceOperation(
    {
      operation: telemetry.operation,
      requestId: telemetry.requestId,
      runtime: telemetry.runtime,
      sink: telemetry.sink,
      subsystem: telemetry.subsystem,
    },
    execute
  )
}
