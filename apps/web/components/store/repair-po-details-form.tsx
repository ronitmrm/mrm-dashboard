"use client"

import { useState } from "react"

import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { FormGrid } from "@/components/ui/golden-patterns"

type RepairUnit = {
  assetCode: string
  assetName: string
  holder: string
  status: string
}

type RepairSupplier = {
  code: string
  id: string
  name: string
}

type RepairDetails = {
  serviceDescription: string
  servicePrice: string
  supplierId: string
}

const emptyDetails: RepairDetails = {
  serviceDescription: "",
  servicePrice: "",
  supplierId: "",
}

export function RepairPoDetailsForm({
  suppliers,
  units,
}: {
  suppliers: readonly RepairSupplier[]
  units: readonly RepairUnit[]
}) {
  const [common, setCommon] = useState<RepairDetails>(emptyDetails)
  const [details, setDetails] = useState<Record<string, RepairDetails>>(() =>
    Object.fromEntries(units.map((unit) => [unit.assetCode, emptyDetails]))
  )
  const [applied, setApplied] = useState(false)

  function updateDetail(
    assetCode: string,
    field: keyof RepairDetails,
    value: string
  ) {
    setDetails((current) => ({
      ...current,
      [assetCode]: { ...(current[assetCode] ?? emptyDetails), [field]: value },
    }))
    setApplied(false)
  }

  function applyCommonDetails() {
    setDetails((current) => {
      const next = { ...current }
      for (const unit of units) {
        const existing = current[unit.assetCode] ?? emptyDetails
        next[unit.assetCode] = {
          serviceDescription:
            common.serviceDescription || existing.serviceDescription,
          servicePrice: common.servicePrice || existing.servicePrice,
          supplierId: common.supplierId || existing.supplierId,
        }
      }
      return next
    })
    setApplied(true)
  }

  return (
    <div className="grid min-w-0 gap-5">
      <div className="grid gap-3">
        <div>
          <h3 className="font-medium">Details shared across units</h3>
          <p className="text-sm text-muted-foreground">
            Fill any shared fields and apply them to all units. You can then
            edit each unit separately.
          </p>
        </div>
        <FormGrid className="max-w-none">
          <Field>
            <FieldLabel htmlFor="common-repair-supplier">
              Repair Supplier
            </FieldLabel>
            <NativeSelect
              id="common-repair-supplier"
              onValueChange={(supplierId) =>
                setCommon((current) => ({ ...current, supplierId }))
              }
              value={common.supplierId}
            >
              <NativeSelectOption value="">Select supplier</NativeSelectOption>
              {suppliers.map((supplier) => (
                <NativeSelectOption key={supplier.id} value={supplier.id}>
                  {supplier.code} — {supplier.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="common-repair-scope">Repair Scope</FieldLabel>
            <Input
              id="common-repair-scope"
              onChange={(event) =>
                setCommon((current) => ({
                  ...current,
                  serviceDescription: event.target.value,
                }))
              }
              placeholder="Work to be done"
              value={common.serviceDescription}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="common-repair-price">
              Agreed Repair Price
            </FieldLabel>
            <Input
              id="common-repair-price"
              min="0"
              onChange={(event) =>
                setCommon((current) => ({
                  ...current,
                  servicePrice: event.target.value,
                }))
              }
              placeholder="₹"
              step="0.01"
              type="number"
              value={common.servicePrice}
            />
          </Field>
        </FormGrid>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={
              !common.supplierId &&
              !common.serviceDescription &&
              !common.servicePrice
            }
            onClick={applyCommonDetails}
            type="button"
            variant="outline"
          >
            Apply filled details to all units
          </Button>
          {applied ? (
            <span className="text-sm text-muted-foreground" role="status">
              Applied to {units.length} unit{units.length === 1 ? "" : "s"}.
            </span>
          ) : null}
        </div>
      </div>

      <OperationalTable
        containerClassName="max-h-[34rem] rounded-md border"
        excelFilters={false}
      >
        <TableHeader>
          <TableRow>
            <TableHead>Unit ID</TableHead>
            <TableHead>Asset Name</TableHead>
            <TableHead>Status / Holder</TableHead>
            <TableHead className="min-w-56">Repair Supplier</TableHead>
            <TableHead className="min-w-56">Repair Scope</TableHead>
            <TableHead className="min-w-40">Agreed Repair Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {units.map((unit) => {
            const unitDetails = details[unit.assetCode] ?? emptyDetails
            return (
              <TableRow key={unit.assetCode}>
                <TableCell className="font-medium">
                  {unit.assetCode}
                  <input
                    name="asset_code"
                    type="hidden"
                    value={unit.assetCode}
                  />
                </TableCell>
                <TableCell>{unit.assetName}</TableCell>
                <TableCell>
                  <StatusBadge value={unit.status} />
                  <span className="block text-xs text-muted-foreground">
                    {unit.holder}
                  </span>
                </TableCell>
                <TableCell>
                  <NativeSelect
                    aria-label={`Repair Supplier for ${unit.assetCode}`}
                    name={`supplier_${unit.assetCode}`}
                    onValueChange={(supplierId) =>
                      updateDetail(unit.assetCode, "supplierId", supplierId)
                    }
                    required
                    value={unitDetails.supplierId}
                  >
                    <NativeSelectOption value="">
                      Select supplier
                    </NativeSelectOption>
                    {suppliers.map((supplier) => (
                      <NativeSelectOption key={supplier.id} value={supplier.id}>
                        {supplier.code} — {supplier.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={`Repair scope for ${unit.assetCode}`}
                    name={`service_description_${unit.assetCode}`}
                    onChange={(event) =>
                      updateDetail(
                        unit.assetCode,
                        "serviceDescription",
                        event.target.value
                      )
                    }
                    placeholder="Work to be done"
                    required
                    value={unitDetails.serviceDescription}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={`Agreed repair price for ${unit.assetCode}`}
                    min="0"
                    name={`service_price_${unit.assetCode}`}
                    onChange={(event) =>
                      updateDetail(
                        unit.assetCode,
                        "servicePrice",
                        event.target.value
                      )
                    }
                    placeholder="₹"
                    required
                    step="0.01"
                    type="number"
                    value={unitDetails.servicePrice}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </OperationalTable>
    </div>
  )
}
