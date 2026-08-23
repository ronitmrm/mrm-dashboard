"use client"

import type { CommercialTermType } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { useState } from "react"

import type { CommercialTermOptions } from "@/lib/commercial-term-options"

import { createEnquiryAction } from "./actions"

export type EnquiryCustomerOption = {
  companyName: string
  customerUid: string
  defaultBuyerName: string | null
  defaultCurrency: string | null
  defaultIncoterms: string | null
  defaultPackagingTerms: string | null
  defaultPaymentTerms: string | null
  defaultShipmentMode: string | null
  id: string
}

type CustomerDefaults = {
  buyer: string
  currency: string
  incoterms: string
  packaging_terms: string
  payment_terms: string
  shipment_mode: string
}

function defaultsFor(customer: EnquiryCustomerOption): CustomerDefaults {
  return {
    buyer: customer.defaultBuyerName ?? "",
    currency: customer.defaultCurrency ?? "",
    incoterms: customer.defaultIncoterms ?? "",
    packaging_terms: customer.defaultPackagingTerms ?? "",
    payment_terms: customer.defaultPaymentTerms ?? "",
    shipment_mode: customer.defaultShipmentMode ?? "",
  }
}

function optionsIncludingCurrent(options: string[], current: string) {
  return current && !options.includes(current) ? [current, ...options] : options
}

export function EnquiryLogForm({
  customers,
  organizationId,
  termOptions,
  today,
}: {
  customers: EnquiryCustomerOption[]
  organizationId: string
  termOptions: CommercialTermOptions
  today: string
}) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "")
  const [defaults, setDefaults] = useState<CustomerDefaults>(() =>
    customers[0]
      ? defaultsFor(customers[0])
      : {
          buyer: "",
          currency: "",
          incoterms: "",
          packaging_terms: "",
          payment_terms: "",
          shipment_mode: "",
        }
  )

  function selectCustomer(nextCustomerId: string) {
    const customer = customers.find(({ id }) => id === nextCustomerId)
    setCustomerId(nextCustomerId)
    if (customer) setDefaults(defaultsFor(customer))
  }

  function commercialSelect(
    label: string,
    name: keyof CustomerDefaults,
    termType: CommercialTermType
  ) {
    const id = `enquiry-${name.replaceAll("_", "-")}`
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <NativeSelect
          className="w-full"
          id={id}
          name={name === "buyer" ? "buyer_name" : name}
          onChange={(event) =>
            setDefaults((current) => ({
              ...current,
              [name]: event.target.value,
            }))
          }
          required
          value={defaults[name]}
        >
          <NativeSelectOption value="">Select {label}</NativeSelectOption>
          {optionsIncludingCurrent(termOptions[termType], defaults[name]).map(
            (option) => (
              <NativeSelectOption key={option} value={option}>
                {option}
              </NativeSelectOption>
            )
          )}
        </NativeSelect>
      </Field>
    )
  }

  const hasCustomers = customers.length > 0

  return (
    <form action={createEnquiryAction}>
      <input name="organization_id" type="hidden" value={organizationId} />
      <FieldGroup>
        {!hasCustomers ? (
          <p className="text-sm text-muted-foreground">
            Add An Active Customer Before Logging An Enquiry.
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="enquiry-customer">Customer</FieldLabel>
            <NativeSelect
              className="w-full"
              disabled={!hasCustomers}
              id="enquiry-customer"
              name="customer_id"
              onChange={(event) => selectCustomer(event.target.value)}
              required
              value={customerId}
            >
              {!hasCustomers ? (
                <NativeSelectOption value="">
                  No Active Customers Available
                </NativeSelectOption>
              ) : null}
              {customers.map((customer) => (
                <NativeSelectOption key={customer.id} value={customer.id}>
                  {customer.customerUid} · {customer.companyName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="enquiry-received">Received On</FieldLabel>
            <Input
              defaultValue={today}
              id="enquiry-received"
              name="received_on"
              required
              type="date"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="enquiry-source">Source</FieldLabel>
            <NativeSelect
              className="w-full"
              defaultValue="Email"
              id="enquiry-source"
              name="source"
            >
              <NativeSelectOption value="Email">Email</NativeSelectOption>
              <NativeSelectOption value="Portal">Portal</NativeSelectOption>
              <NativeSelectOption value="Phone">Phone</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="enquiry-priority">Priority</FieldLabel>
            <NativeSelect
              className="w-full"
              defaultValue="Normal"
              id="enquiry-priority"
              name="priority"
            >
              <NativeSelectOption value="Normal">Normal</NativeSelectOption>
              <NativeSelectOption value="High">High</NativeSelectOption>
              <NativeSelectOption value="Urgent">Urgent</NativeSelectOption>
            </NativeSelect>
          </Field>
          {commercialSelect("Buyer", "buyer", "buyer")}
          {commercialSelect("Incoterms", "incoterms", "incoterms")}
          {commercialSelect("Payment Terms", "payment_terms", "payment_terms")}
          {commercialSelect("Shipment Mode", "shipment_mode", "shipment_mode")}
          {commercialSelect("Packaging", "packaging_terms", "packaging_terms")}
          {commercialSelect("Currency", "currency", "currency")}
          <Field>
            <FieldLabel htmlFor="enquiry-fx">Fx / Exchange Rate</FieldLabel>
            <Input
              defaultValue="1"
              id="enquiry-fx"
              min="0.00000001"
              name="conversion_rate"
              required
              step="0.00000001"
              type="number"
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="enquiry-remarks">Remarks</FieldLabel>
          <Textarea id="enquiry-remarks" name="remarks" />
          <FieldDescription>
            Technical Line Details Are Added After The Enquiry Is Logged.
          </FieldDescription>
        </Field>
        <Button disabled={!hasCustomers} type="submit">
          Log Enquiry
        </Button>
      </FieldGroup>
    </form>
  )
}
