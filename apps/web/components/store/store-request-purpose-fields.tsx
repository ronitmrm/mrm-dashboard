"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

export type RequestKind = "DEPARTMENT_USE" | "PERSON_USE" | "STORE_TRANSFER"

const RequestKindContext = createContext<{
  kind: RequestKind
  setKind: (kind: RequestKind) => void
} | null>(null)

export function StoreRequestKindProvider({
  children,
  initialKind,
}: {
  children: ReactNode
  initialKind: RequestKind
}) {
  const [kind, setKind] = useState<RequestKind>(initialKind)
  return (
    <RequestKindContext.Provider value={{ kind, setKind }}>
      {children}
    </RequestKindContext.Provider>
  )
}

export function useStoreRequestKind() {
  const context = useContext(RequestKindContext)
  if (!context) throw new Error("Store request kind is unavailable.")
  return context
}

export function StoreRequestPurposeFields({
  canUse,
  initialStoreCode,
  stores,
}: {
  canUse: boolean
  initialStoreCode: string
  stores: Array<{ code: string; name: string }>
}) {
  const { kind, setKind } = useStoreRequestKind()

  return (
    <>
      <Field>
        <FieldLabel htmlFor="request-kind">Request for</FieldLabel>
        <NativeSelect
          id="request-kind"
          name="fulfillment_kind"
          onValueChange={(value) => setKind(value as RequestKind)}
          value={kind}
        >
          {canUse ? <NativeSelectOption value="DEPARTMENT_USE">Use by my Department</NativeSelectOption> : null}
          {canUse ? <NativeSelectOption value="PERSON_USE">My own use</NativeSelectOption> : null}
          {stores.length ? (
            <NativeSelectOption value="STORE_TRANSFER">
              Stock and responsibility for my Store
            </NativeSelectOption>
          ) : null}
        </NativeSelect>
      </Field>
      {kind === "STORE_TRANSFER" ? (
        <Field>
          <FieldLabel htmlFor="request-receiving-store">Receiving Store</FieldLabel>
          <NativeSelect
            defaultValue={initialStoreCode}
            id="request-receiving-store"
            name="receiving_store_code"
            required
          >
            <NativeSelectOption disabled value="">Select your Store</NativeSelectOption>
            {stores.map((store) => (
              <NativeSelectOption key={store.code} value={store.code}>
                {store.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      <p className="text-xs text-muted-foreground md:col-span-2">
        {kind === "STORE_TRANSFER"
          ? "For Non Consumables, enter a quantity. Main Store reviews the FIFO Unit IDs before transferring responsibility."
          : kind === "PERSON_USE"
            ? "The item will be issued to you; Main Store keeps responsibility for returnable equipment."
            : "The item will be issued to your Department; Main Store keeps responsibility for returnable equipment."}
      </p>
    </>
  )
}
