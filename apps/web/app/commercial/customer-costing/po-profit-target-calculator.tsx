"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { MetricCard } from "@workspace/ui/components/card"

type ProductInputs = {
  alloyPremium: number
  annealing: number
  assemblyOperationCost: number
  buffing: number
  burningLossPercent: number
  casting: number
  checking: number
  deburring: number
  directPurchasePricePerPiece: number
  extrusionCost: number
  forgingCost: number
  itemType: string
  machiningCost: number
  marking: number
  overheadCost: number
  plating: number
  pricingMethod: string
  productCostInr: number
  rejectionPercent: number
  sealant: number
  washing: number
  weight100Pcs: number
}

type FormValues = {
  conversionRate: number
  overheadCost: number
  packingCost: number
  purchaseTimes: number
  scrapRate: number
  shippingCost: number
}

const numeric = (value: FormDataEntryValue | null, fallback = 0) => {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? parsed : fallback
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  }).format(value)

function baseCost(product: ProductInputs, values: FormValues) {
  const storedCost =
    product.itemType.toLowerCase() === "package"
      ? product.productCostInr
      : product.pricingMethod === "Direct Purchase"
        ? product.directPurchasePricePerPiece
        : 0
  if (storedCost > 0) {
    return {
      piecesPerKg:
        product.weight100Pcs > 0
          ? 1000 / product.weight100Pcs
          : product.directPurchasePricePerPiece > 0
            ? 1
            : 0,
      rateInrWithoutProfit: storedCost,
      totalA: storedCost,
    }
  }

  const piecesPerKg =
    product.weight100Pcs > 0 ? 1000 / product.weight100Pcs : 0
  const netRateWithoutAlloy =
    values.scrapRate + product.extrusionCost + product.forgingCost
  const netRateWithAlloy = netRateWithoutAlloy + product.alloyPremium
  const rawMaterialCost =
    values.purchaseTimes * netRateWithAlloy +
    (product.casting - values.purchaseTimes) * netRateWithoutAlloy
  const scrapReturnPrice =
    (product.casting - 1) *
    values.scrapRate *
    (1 - product.burningLossPercent)
  const totalRodsCost = rawMaterialCost - scrapReturnPrice
  const rejectionCost = totalRodsCost * product.rejectionPercent
  const processCost =
    product.machiningCost +
    product.washing +
    product.checking +
    product.marking +
    product.plating +
    product.annealing +
    product.deburring +
    product.buffing +
    product.sealant +
    product.assemblyOperationCost +
    product.overheadCost +
    values.packingCost +
    values.shippingCost +
    values.overheadCost
  const totalA = processCost + totalRodsCost + rejectionCost
  return {
    piecesPerKg,
    rateInrWithoutProfit: piecesPerKg > 0 ? totalA / piecesPerKg : 0,
    totalA,
  }
}

export function PoProfitTargetCalculator({
  currency,
  product,
  targetPrice,
}: {
  currency: string
  product: ProductInputs
  targetPrice: number
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [values, setValues] = useState<FormValues>({
    conversionRate: 1,
    overheadCost: 0,
    packingCost: 0,
    purchaseTimes: 1,
    scrapRate: 0,
    shippingCost: 0,
  })

  useEffect(() => {
    const form = rootRef.current?.closest("form")
    if (!form) return
    const readValues = () => {
      const data = new FormData(form)
      setValues({
        conversionRate: numeric(data.get("conversion_rate"), 1),
        overheadCost: numeric(data.get("quote_overhead_cost")),
        packingCost: numeric(data.get("packing_cost")),
        purchaseTimes: numeric(data.get("purchase_times"), 1),
        scrapRate: numeric(data.get("scrap_rate")),
        shippingCost: numeric(data.get("shipping_cost")),
      })
    }
    readValues()
    form.addEventListener("input", readValues)
    form.addEventListener("change", readValues)
    return () => {
      form.removeEventListener("input", readValues)
      form.removeEventListener("change", readValues)
    }
  }, [])

  const suggestion = useMemo(() => {
    const base = baseCost(product, values)
    const targetInr = targetPrice * values.conversionRate
    const targetBeforeRate =
      base.piecesPerKg > 0 ? targetInr * base.piecesPerKg : targetInr
    const profitPercent =
      base.totalA > 0 ? (targetBeforeRate - base.totalA) / base.totalA : 0
    return {
      ...base,
      profitAmount: base.totalA * profitPercent,
      profitPercent,
      targetInr,
    }
  }, [product, targetPrice, values])

  const applySuggestedProfit = () => {
    const input = rootRef.current
      ?.closest("form")
      ?.elements.namedItem("profit_percent")
    if (input instanceof HTMLInputElement) {
      input.value = String(
        Number(suggestion.profitPercent * 100).toFixed(4)
      )
      input.dispatchEvent(new Event("input", { bubbles: true }))
    }
  }

  return (
    <div
      className="grid gap-3 rounded-2xl border border-dashed p-4 sm:grid-cols-2 xl:grid-cols-5"
      ref={rootRef}
    >
      <MetricCard label="PO Target / Pc" value={`${currency} ${money(targetPrice)}`} />
      <MetricCard label="Target INR / Pc" value={`₹ ${money(suggestion.targetInr)}`} />
      <MetricCard label="Base Before Profit" value={`₹ ${money(suggestion.rateInrWithoutProfit)}`} />
      <MetricCard label="Required Profit" value={`${money(suggestion.profitPercent * 100)}%`} />
      <div className="grid content-center gap-2">
        <span className="text-xs text-muted-foreground">
          Profit Amount ₹ {money(suggestion.profitAmount)}
        </span>
        <Button onClick={applySuggestedProfit} type="button" variant="outline">
          Use Suggested Profit
        </Button>
      </div>
    </div>
  )
}
