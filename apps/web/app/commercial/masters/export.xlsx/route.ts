import {
  createCommercialMasterRepository,
  createCustomerRepository,
} from "@workspace/db"
import * as XLSX from "xlsx"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

import { buildMastersWorkbook } from "../workbook"

export const dynamic = "force-dynamic"

export async function GET() {
  await requireCapability("pricing.masters.read", "/commercial/masters")
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialMasterRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    const workbook = buildMastersWorkbook(
      await repository.snapshot(organizationId)
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
