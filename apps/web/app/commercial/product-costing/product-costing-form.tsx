"use client"

import Link from "next/link"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"

import { updateProductCostingAction } from "../costing/actions"

type CostingProduct = {
  alloyPremium: number
  annealing: number
  assemblyOperationCost: number
  buffing: number
  burningLossPercent: number
  casting: number
  checking: number
  deburring: number
  description: string
  directPurchasePricePerKg: number
  extrusionCost: number
  forgingCost: number
  id: string
  itemType: string
  machineTypeId: string | null
  machiningCost: number
  marking: number
  materialGrade: string | null
  overheadCost: number
  piecesPerKg: number
  plating: number
  pricingMethod: string
  processesRequired: string[]
  productionType: string | null
  rejectionPercent: number
  remarks: string | null
  rodSize: string | null
  rodType: string | null
  sealant: number
  uid: string
  washing: number
  weight100Pcs: number
}

type BomPart = {
  depth: number
  description: string
  itemId: string
  itemType: string
  lifecycleStatus: string
  lineQuantity: number
  parentItemId: string
  productCostInr: number
  quantity: number
  uid: string
  weight100Pcs: number
}

const processFields = [
  ["washing", "Washing (INR/kg)"],
  ["checking", "Checking (INR/kg)"],
  ["marking", "Marking (INR/kg)"],
  ["plating", "Plating (INR/kg)"],
  ["annealing", "Annealing (INR/kg)"],
  ["deburring", "Deburring (INR/kg)"],
  ["buffing", "Buffing (INR/kg)"],
  ["sealant", "Sealant (INR/kg)"],
  ["overheadCost", "Overhead Charges (INR/kg)"],
] as const

const processAliases: Record<(typeof processFields)[number][0], string[]> = {
  annealing: ["annealing", "anneling"],
  buffing: ["buffing", "buff"],
  checking: ["checking", "inspection", "quality checking"],
  deburring: ["deburring", "debbring"],
  marking: ["marking", "mark"],
  overheadCost: ["overhead", "overhead charges"],
  plating: ["plating", "plate"],
  sealant: ["sealant", "sealing"],
  washing: ["washing", "wash"],
}

function processAllowed(
  name: (typeof processFields)[number][0],
  selectedProcesses: Set<string>
) {
  if (name === "overheadCost") return true
  for (const alias of processAliases[name]) {
    if (selectedProcesses.has(alias)) return true
    for (const process of selectedProcesses) {
      if (process.includes(alias) || alias.includes(process)) return true
    }
  }
  return false
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  }).format(value)
}

function NumberField({
  defaultValue,
  label,
  name,
}: {
  defaultValue: number
  label: string
  name: string
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        defaultValue={defaultValue}
        min="0"
        name={name}
        step="any"
        type="number"
      />
    </Field>
  )
}

export function ProductCostingForm({
  bomParts,
  machineTypes,
  product,
  rootItemId,
  taskId,
}: {
  bomParts: BomPart[]
  machineTypes: Array<{ id: string; name: string }>
  product: CostingProduct
  rootItemId: string
  taskId: string
}) {
  const [pricingMethod, setPricingMethod] = useState(product.pricingMethod)
  const [directPricePerKg, setDirectPricePerKg] = useState(
    product.directPurchasePricePerKg
  )
  const [machiningCost, setMachiningCost] = useState(product.machiningCost)
  const [assemblyOperationCost, setAssemblyOperationCost] = useState(
    product.assemblyOperationCost
  )
  const isRoot = product.id === rootItemId
  const isBomParent = ["Package", "Assembly"].includes(product.itemType)
  const isDirectPurchase = pricingMethod === "Direct Purchase"
  const isBarstock = product.productionType?.toLowerCase() === "barstock"
  const piecesPerKg =
    product.weight100Pcs > 0 ? 1000 / product.weight100Pcs : product.piecesPerKg
  const directPricePerPiece =
    piecesPerKg > 0 ? directPricePerKg / piecesPerKg : 0
  const machiningPricePerPiece =
    piecesPerKg > 0 ? machiningCost / piecesPerKg : 0
  const assemblyPricePerPiece =
    piecesPerKg > 0 ? assemblyOperationCost / piecesPerKg : 0
  const selectedProcesses = new Set(
    product.processesRequired.map((process) => process.toLowerCase())
  )
  const directChildren = bomParts.filter(
    (part) => part.parentItemId === product.id
  )
  const firstOpenChild = directChildren.find(
    (part) => part.lifecycleStatus !== "P" && part.productCostInr <= 0
  )
  const productHref = (itemId: string) =>
    `/commercial/product-costing?task=${encodeURIComponent(taskId)}&item=${encodeURIComponent(itemId)}#product-cost-form`

  return (
    <form action={updateProductCostingAction} className="grid gap-6">
      <input name="item_id" type="hidden" value={product.id} />

      <div className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Product</p>
          <p className="font-medium">{product.uid}</p>
          <p className="text-sm text-muted-foreground">{product.description}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Production Type</p>
          <p className="text-sm font-medium">{product.productionType || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Grade / Rod</p>
          <p className="text-sm font-medium">
            {product.materialGrade || "—"} / {product.rodType || "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Rod Size / Casting</p>
          <p className="text-sm font-medium">
            {product.rodSize || "—"} / {money(product.casting)}
          </p>
        </div>
      </div>

      {isRoot && bomParts.length ? (
        <div className="overflow-auto rounded-2xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Part</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Cost / Piece</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {bomParts.map((part) => (
                <tr className="border-t" key={`${part.depth}-${part.itemId}`}>
                  <td className="px-3 py-2">
                    <span
                      style={{
                        paddingInlineStart: `${(part.depth - 1) * 16}px`,
                      }}
                    >
                      {part.uid} · {part.description}
                    </span>
                  </td>
                  <td className="px-3 py-2">{part.itemType}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {part.lineQuantity}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {money(part.productCostInr)}
                  </td>
                  <td className="px-3 py-2">
                    {part.lifecycleStatus === "P"
                      ? "Portfolio · skipped"
                      : part.productCostInr > 0
                        ? "Costed"
                        : "Costing pending"}
                  </td>
                  <td className="px-3 py-2">
                    {part.lifecycleStatus === "P" ? (
                      "—"
                    ) : (
                      <Button asChild size="sm" variant="outline">
                        <Link href={productHref(part.itemId)}>Open Part</Link>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isBomParent ? (
        <>
          <input name="pricing_method" type="hidden" value="Derived" />
          <input
            name="weight_100_pcs"
            type="hidden"
            value={product.weight100Pcs}
          />
          <input name="pieces_per_kg" type="hidden" value={piecesPerKg} />
          {[
            "alloy_premium",
            "extrusion_cost",
            "forging_cost",
            "direct_purchase_price_per_kg",
            "machining_cost",
            "washing",
            "checking",
            "marking",
            "plating",
            "annealing",
            "deburring",
            "buffing",
            "sealant",
            "overhead_cost",
            "burning_loss_percent",
          ].map((name) => (
            <input key={name} name={name} type="hidden" value="0" />
          ))}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Piece Weight</p>
              <p className="font-medium tabular-nums">
                {money(product.weight100Pcs)} g
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pieces / Kg</p>
              <p className="font-medium tabular-nums">{money(piecesPerKg)}</p>
            </div>
            <Field>
              <FieldLabel>Assembly Cost (INR/kg)</FieldLabel>
              <Input
                name="assembly_operation_cost"
                onChange={(event) =>
                  setAssemblyOperationCost(Number(event.target.value) || 0)
                }
                step="any"
                type="number"
                value={assemblyOperationCost}
              />
            </Field>
            <div>
              <p className="text-xs text-muted-foreground">
                Assembly Cost (INR/pc)
              </p>
              <p className="font-medium tabular-nums">
                {money(assemblyPricePerPiece)}
              </p>
            </div>
            <NumberField
              defaultValue={product.rejectionPercent * 100}
              label="Rejection (%)"
              name="rejection_percent"
            />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field>
              <FieldLabel>Product Pricing</FieldLabel>
              <NativeSelect
                name="pricing_method"
                onChange={(event) => setPricingMethod(event.target.value)}
                value={pricingMethod}
              >
                <NativeSelectOption value="Derived">Derived</NativeSelectOption>
                <NativeSelectOption value="Direct Purchase">
                  Direct Purchase
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <div>
              <p className="text-xs text-muted-foreground">One-Piece Weight</p>
              <p className="font-medium tabular-nums">
                {money(product.weight100Pcs)} g
              </p>
              <input
                name="weight_100_pcs"
                type="hidden"
                value={product.weight100Pcs}
              />
              <input name="pieces_per_kg" type="hidden" value={piecesPerKg} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pieces / Kg</p>
              <p className="font-medium tabular-nums">{money(piecesPerKg)}</p>
            </div>
            <Field>
              <FieldLabel>Machine Type</FieldLabel>
              <NativeSelect
                defaultValue={
                  isDirectPurchase ? "" : (product.machineTypeId ?? "")
                }
                disabled={isDirectPurchase}
                name="machine_type_id"
              >
                <NativeSelectOption value="">Not Selected</NativeSelectOption>
                {machineTypes.map((machineType) => (
                  <NativeSelectOption
                    key={machineType.id}
                    value={machineType.id}
                  >
                    {machineType.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>

          {isDirectPurchase ? (
            <>
              {[
                "alloy_premium",
                "extrusion_cost",
                "forging_cost",
                "machining_cost",
                "washing",
                "checking",
                "marking",
                "plating",
                "annealing",
                "deburring",
                "buffing",
                "sealant",
                "assembly_operation_cost",
                "overhead_cost",
                "burning_loss_percent",
              ].map((name) => (
                <input key={name} name={name} type="hidden" value="0" />
              ))}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field>
                  <FieldLabel>Direct Price (INR/kg)</FieldLabel>
                  <Input
                    name="direct_purchase_price_per_kg"
                    onChange={(event) =>
                      setDirectPricePerKg(Number(event.target.value) || 0)
                    }
                    step="any"
                    type="number"
                    value={directPricePerKg}
                  />
                </Field>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Direct Price (INR/pc)
                  </p>
                  <p className="font-medium tabular-nums">
                    {money(directPricePerPiece)}
                  </p>
                </div>
                <NumberField
                  defaultValue={product.rejectionPercent * 100}
                  label="Rejection (%)"
                  name="rejection_percent"
                />
              </div>
            </>
          ) : (
            <>
              <input
                name="direct_purchase_price_per_kg"
                type="hidden"
                value="0"
              />
              <input name="assembly_operation_cost" type="hidden" value="0" />
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <NumberField
                  defaultValue={product.alloyPremium}
                  label="Alloy Premium (INR/kg)"
                  name="alloy_premium"
                />
                <NumberField
                  defaultValue={product.extrusionCost}
                  label="Extrusion Cost (INR/kg)"
                  name="extrusion_cost"
                />
                <Field>
                  <FieldLabel>Forging Cost (INR/kg)</FieldLabel>
                  <Input
                    defaultValue={isBarstock ? 0 : product.forgingCost}
                    disabled={isBarstock}
                    name="forging_cost"
                    step="any"
                    type="number"
                  />
                  {isBarstock ? (
                    <input name="forging_cost" type="hidden" value="0" />
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel>Machining Cost (INR/kg)</FieldLabel>
                  <Input
                    name="machining_cost"
                    onChange={(event) =>
                      setMachiningCost(Number(event.target.value) || 0)
                    }
                    step="any"
                    type="number"
                    value={machiningCost}
                  />
                </Field>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Machining Cost (INR/pc)
                  </p>
                  <p className="font-medium tabular-nums">
                    {money(machiningPricePerPiece)}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {processFields.map(([property, label]) => {
                  const allowed = processAllowed(property, selectedProcesses)
                  const name =
                    property === "overheadCost" ? "overhead_cost" : property
                  return (
                    <Field key={property}>
                      <FieldLabel>{label}</FieldLabel>
                      <Input
                        defaultValue={allowed ? product[property] : 0}
                        disabled={!allowed}
                        name={allowed ? name : undefined}
                        step="any"
                        type="number"
                      />
                      {!allowed ? (
                        <input name={name} type="hidden" value="0" />
                      ) : null}
                    </Field>
                  )
                })}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  defaultValue={product.rejectionPercent * 100}
                  label="Rejection (%)"
                  name="rejection_percent"
                />
                <NumberField
                  defaultValue={product.burningLossPercent * 100}
                  label="Burning Loss (%)"
                  name="burning_loss_percent"
                />
              </div>
            </>
          )}
        </>
      )}

      <FieldGroup>
        <Field>
          <FieldLabel>Costing Remarks</FieldLabel>
          <Textarea defaultValue={product.remarks ?? ""} name="remarks" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button name="action" type="submit" value="in_progress">
            {isRoot ? "Save In Progress" : "Save Current Part"}
          </Button>
          {isRoot && !firstOpenChild ? (
            <Button
              name="action"
              type="submit"
              value="complete"
              variant="secondary"
            >
              Save Complete & Send To Customer Parameter Costing
            </Button>
          ) : null}
          {isRoot && firstOpenChild ? (
            <Button asChild variant="outline">
              <Link href={productHref(firstOpenChild.itemId)}>
                Open First Pending Child
              </Link>
            </Button>
          ) : null}
          {!isRoot ? (
            <Button asChild variant="outline">
              <Link href={productHref(rootItemId)}>
                Open Package / Assembly
              </Link>
            </Button>
          ) : null}
        </div>
      </FieldGroup>
    </form>
  )
}
