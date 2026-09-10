"use server"

import {
  createCommercialMasterRepository,
  createCustomerRepository,
  priceMasterProcesses,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCapability } from "@/lib/auth/master-capabilities"

export async function savePriceMasterAction(formData: FormData) {
  const session = await requireCapability(
    masterCapability("priceMaster", "save"),
    "/commercial/price-master"
  )
  const connectionString = readAuthEnvironment().connectionString
  const repository = createCommercialMasterRepository({ connectionString })
  const customers = createCustomerRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    const current = await repository.priceMaster(organizationId)
    const markets = Array.from(formData.entries()).filter(
      ([key, value]) => key.startsWith("market:") && value.toString().trim()
    )
    const processes = Object.fromEntries(
      priceMasterProcesses.flatMap(({ key }) => {
        const raw = formData.get(key)?.toString().trim()
        return raw ? [[key, Number(raw)]] : []
      })
    )
    const exchangeRates = Object.fromEntries(
      Array.from(formData.entries())
        .filter(
          ([key, value]) =>
            key.startsWith("exchange:") && value.toString().trim()
        )
        .map(([key, value]) => [key.slice(9), Number(value)])
    )
    await repository.savePriceMaster({
      organizationId,
      actorUserId: session.user.id,
      prices: {
        marketRates: [
          ...current.marketRates.filter(
            (rate) => !formData.has(`market:${rate.gradeId}`)
          ),
          ...markets.map(([key, value]) => ({
            gradeId: key.slice(7),
            rate: Number(value),
          })),
        ],
        processes,
        exchangeRates: {
          ...Object.fromEntries(
            Object.entries(current.exchangeRates).filter(
              ([currency]) => !formData.has(`exchange:${currency}`)
            )
          ),
          ...exchangeRates,
        },
      },
    })
  } finally {
    await repository.close()
    await customers.close()
  }
  revalidatePath("/commercial/price-master")
  redirect("/commercial/price-master?saved=1")
}
