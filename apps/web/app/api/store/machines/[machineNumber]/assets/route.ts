import { createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ machineNumber: string }> }
) {
  const { machineNumber } = await params
  await requireCapability("operations.dashboard.read", "/")
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const [current, history] = await Promise.all([
      repository.listAssetsForMachine({ machineNumber, organizationId }),
      repository.listAssetHistoryForMachine({ machineNumber, organizationId }),
    ])
    return Response.json({ current, history })
  } finally {
    await repository.close()
  }
}
