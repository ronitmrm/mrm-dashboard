"use client"

import { useActionState, useState, type ChangeEvent } from "react"
import { Button } from "@workspace/ui/components/button"
import { CardContent, SectionCard } from "@workspace/ui/components/card"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { StandardState } from "@workspace/ui/components/standard-state"
import { FormGrid, FormSection } from "@/components/ui/golden-patterns"
import { recordExistingStoreStockAction } from "@/app/store/actions"

export function StoreExistingStockForm({
  entryKey,
  today,
  items,
  locations,
  suppliers,
  saved,
}: {
  entryKey: string
  today: string
  saved: boolean
  items: Array<{
    id: string
    typeCode: string
    assetName: string
    identificationName: string
    makeModel: string
    unit: string
    trackingMode: string
  }>
  locations: Array<{ id: string; name: string }>
  suppliers: Array<{ id: string; name: string }>
}) {
  const [state, action, pending] = useActionState(
    recordExistingStoreStockAction,
    { error: null }
  )
  const [values, setValues] = useState<Record<string, string>>({})
  const serialized =
    items.find((item) => item.id === values.item_type_id)?.trackingMode ===
    "SERIALIZED"
  function field(name: string, initial = "") {
    return {
      name,
      value: values[name] ?? initial,
      onChange: (
        event: ChangeEvent<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >
      ) => {
        const value = event.target.value
        setValues((previous) => ({
          ...previous,
          [name]: value,
          ...(name === "item_type_id" ? { condition: "AVAILABLE" } : {}),
        }))
      },
    }
  }
  return (
    <>
      {saved && !state.error && !Object.keys(values).length ? (
        <SectionCard role="status">
          <CardContent className="py-4 text-sm">
            Existing stock recorded. Stock and Unit IDs are now available in the
            Stock Register. You can allocate the usable units to the relevant
            department or machine.
          </CardContent>
        </SectionCard>
      ) : null}
      <FormSection
        title="Add existing stock"
        width="wide"
        description="Register items the company already owns. Leave unknown historical details blank. The entry date and person recording it are saved automatically."
      >
        <form action={action} className="grid gap-4">
          <input type="hidden" name="entry_key" value={entryKey} />
          <fieldset disabled={pending} className="grid gap-4">
            <FormGrid>
              <Field>
                <FieldLabel htmlFor="existing-item">Asset Code</FieldLabel>
                <NativeSelect
                  id="existing-item"
                  {...field("item_type_id")}
                  required
                >
                  <NativeSelectOption value="">
                    Select Asset Code
                  </NativeSelectOption>
                  {items.map((item) => (
                    <NativeSelectOption key={item.id} value={item.id}>
                      {item.typeCode} · {item.assetName} ·{" "}
                      {item.identificationName || item.makeModel} · {item.unit}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="existing-quantity">Quantity</FieldLabel>
                <Input
                  id="existing-quantity"
                  {...field("quantity")}
                  type="number"
                  min={serialized ? "1" : "0.001"}
                  step={serialized ? "1" : "0.001"}
                  max={serialized ? "500" : undefined}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Non Consumables need a whole number; each receives its own
                  Unit ID.
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="existing-location">
                  Main Store storage location
                </FieldLabel>
                <NativeSelect
                  id="existing-location"
                  {...field("location_id")}
                  required
                >
                  <NativeSelectOption value="">
                    Select location
                  </NativeSelectOption>
                  {locations.map((location) => (
                    <NativeSelectOption key={location.id} value={location.id}>
                      {location.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="existing-condition">
                  Current condition
                </FieldLabel>
                <NativeSelect
                  id="existing-condition"
                  {...field("condition", "AVAILABLE")}
                  required
                >
                  <NativeSelectOption value="AVAILABLE">
                    Usable
                  </NativeSelectOption>
                  {serialized ? (
                    <NativeSelectOption value="BROKEN">
                      Needs repair
                    </NativeSelectOption>
                  ) : null}
                </NativeSelect>
              </Field>
            </FormGrid>
            <FormSection title="Original purchase details" width="full">
              <FormGrid>
                <Field>
                  <FieldLabel htmlFor="existing-purchase-date">
                    Purchase date
                  </FieldLabel>
                  <Input
                    id="existing-purchase-date"
                    {...field("purchased_on")}
                    type="date"
                    max={today}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="existing-supplier">
                    Original supplier
                  </FieldLabel>
                  <NativeSelect
                    id="existing-supplier"
                    {...field("supplier_id")}
                  >
                    <NativeSelectOption value="">Not known</NativeSelectOption>
                    {suppliers.map((supplier) => (
                      <NativeSelectOption key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="existing-price">
                    Original price per unit (₹)
                  </FieldLabel>
                  <Input
                    id="existing-price"
                    {...field("unit_price")}
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="existing-bill">
                    Bill / invoice number
                  </FieldLabel>
                  <Input id="existing-bill" {...field("bill_number")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="existing-bill-date">
                    Bill date
                  </FieldLabel>
                  <Input
                    id="existing-bill-date"
                    {...field("bill_date")}
                    type="date"
                    max={today}
                  />
                </Field>
              </FormGrid>
            </FormSection>
            {serialized ? (
              <FormSection title="Physical unit details" width="full">
                <FormGrid>
                  <Field>
                    <FieldLabel htmlFor="existing-make">
                      Manufacturer / make
                    </FieldLabel>
                    <Input id="existing-make" {...field("manufacturer_make")} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="existing-installed">
                      Installation date
                    </FieldLabel>
                    <Input
                      id="existing-installed"
                      {...field("installed_on")}
                      type="date"
                      max={today}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="existing-warranty-days">
                      Warranty period (days)
                    </FieldLabel>
                    <Input
                      id="existing-warranty-days"
                      {...field("warranty_period")}
                      type="number"
                      min="1"
                      step="1"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="existing-warranty-until">
                      Warranty expiry date
                    </FieldLabel>
                    <Input
                      id="existing-warranty-until"
                      {...field("warranty_until")}
                      type="date"
                    />
                  </Field>
                </FormGrid>
                <Field>
                  <FieldLabel htmlFor="existing-serials">
                    Manufacturer serial numbers
                  </FieldLabel>
                  <Textarea
                    id="existing-serials"
                    {...field("serial_numbers")}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    One per line, matching the quantity. Leave blank if unknown;
                    the system still creates Unit IDs.
                  </p>
                </Field>
              </FormSection>
            ) : null}
            <Field>
              <FieldLabel htmlFor="existing-remarks">
                Notes / source of existing stock
              </FieldLabel>
              <Textarea id="existing-remarks" {...field("remark")} rows={2} />
            </Field>
            {state.error ? (
              <StandardState
                variant="error"
                title="Stock entry could not be saved"
                description={state.error}
              />
            ) : null}
            <Button
              className="w-fit"
              type="submit"
              disabled={pending || !items.length || !locations.length}
            >
              {pending ? "Saving…" : "Record Existing Stock"}
            </Button>
          </fieldset>
        </form>
      </FormSection>
    </>
  )
}
