import {
  createCommercialMasterRepository,
  createCustomerRepository,
} from "@workspace/db"
import * as XLSX from "xlsx"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { listGrantedCapabilities, requireAuthenticatedSession, requireCapability } from "@/lib/auth/require-capability"
import { commercialTemplateReadCapabilities, readableCommercialSnapshot } from "@/lib/auth/commercial-master-access"

import { buildMastersWorkbook } from "../workbook"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await requireAuthenticatedSession("/commercial/masters")
  const grants = await listGrantedCapabilities(session.user.id, commercialTemplateReadCapabilities())
  if (!grants.length) return new Response("Forbidden", { status: 403 })
  await requireCapability(grants[0]!, "/commercial/masters")
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialMasterRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    const workbook = buildMastersWorkbook(
      readableCommercialSnapshot(await repository.snapshot(organizationId), grants)
    )
    const output = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    }) as Buffer
    return new Response(
      output.buffer.slice(
        output.byteOffset,
        output.byteOffset + output.byteLength
      ) as ArrayBuffer,
      {
        headers: {
          "Content-Disposition": 'attachment; filename="masters-export.xlsx"',
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      }
    )
  } finally {
    await repository.close()
    await customers.close()
  }
}
