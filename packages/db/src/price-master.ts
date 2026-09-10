import type { Pool, PoolClient } from "pg"

export const priceMasterProcesses = [
  { key: "forgingCost", label: "Forging", perPiece: false },
  { key: "washing", label: "Washing", perPiece: false },
  { key: "checking", label: "Checking", perPiece: false },
  { key: "plating", label: "Plating", perPiece: false },
  { key: "buffing", label: "Buffing", perPiece: true },
  { key: "marking", label: "Marking", perPiece: true },
  { key: "annealing", label: "Annealing", perPiece: false },
  { key: "deburring", label: "Deburring", perPiece: false },
  { key: "sealant", label: "Sealant", perPiece: true },
  { key: "overheadCost", label: "Overhead", perPiece: false },
] as const
export type PriceMaster = {
  marketRates: Array<{ gradeId: string; rate: number }>
  processes: Partial<
    Record<(typeof priceMasterProcesses)[number]["key"], number>
  >
  exchangeRates: Record<string, number>
}
export async function readPriceMaster(
  client: Pool | PoolClient,
  organizationId: string
): Promise<PriceMaster> {
  const result = await client.query<{ prices: PriceMaster }>(
    "SELECT prices FROM sales.price_master WHERE organization_id = $1",
    [organizationId]
  )
  return (
    result.rows[0]?.prices ?? {
      marketRates: [],
      processes: {},
      exchangeRates: {},
    }
  )
}

export function productPriceDefaults(prices: PriceMaster, piecesPerKg: number) {
  return Object.fromEntries(
    priceMasterProcesses.flatMap(({ key, perPiece }) => {
      const rate = prices.processes[key]
      return rate === undefined
        ? []
        : [[key, rate * (perPiece ? piecesPerKg : 1)]]
    })
  ) as PriceMaster["processes"]
}
