"use client"

import { useMemo, useState } from "react"

import { Field, FieldLabel } from "@workspace/ui/components/field"
import { SearchableSelect } from "@workspace/ui/components/searchable-select"

type ProductOption = {
  category: string | null
  description: string
  id: string
  subcategory: string | null
  uid: string
}

function uniqueValues(values: Array<string | null>) {
  return [
    ...new Set(
      values.flatMap((value) => {
        const normalized = value?.trim()
        return normalized ? [normalized] : []
      })
    ),
  ].sort((left, right) => left.localeCompare(right))
}

export function EcnProductSelector({ items }: { items: ProductOption[] }) {
  const [category, setCategory] = useState("")
  const [selectedItemId, setSelectedItemId] = useState("")
  const [subcategory, setSubcategory] = useState("")

  const categories = useMemo(
    () => uniqueValues(items.map((item) => item.category)),
    [items]
  )
  const categoryItems = useMemo(
    () =>
      category ? items.filter((item) => item.category === category) : items,
    [category, items]
  )
  const subcategories = useMemo(
    () => uniqueValues(categoryItems.map((item) => item.subcategory)),
    [categoryItems]
  )
  const visibleItems = useMemo(
    () =>
      subcategory
        ? categoryItems.filter((item) => item.subcategory === subcategory)
        : categoryItems,
    [categoryItems, subcategory]
  )
  const value = visibleItems.some((item) => item.id === selectedItemId)
    ? selectedItemId
    : ""

  function selectProduct(itemId: string) {
    setSelectedItemId(itemId)
    const item = items.find((candidate) => candidate.id === itemId)
    if (!item) return
    setCategory(item.category ?? "")
    setSubcategory(item.subcategory ?? "")
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field>
        <FieldLabel htmlFor="ecn-product-uid">Product UID</FieldLabel>
        <SearchableSelect
          id="ecn-product-uid"
          onChange={(event) => selectProduct(event.currentTarget.value)}
          searchPlaceholder="Search UID..."
          value={value}
        >
          <option value="">All UIDs</option>
          {visibleItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.uid}
            </option>
          ))}
        </SearchableSelect>
      </Field>

      <Field>
        <FieldLabel htmlFor="ecn-product-category">Category</FieldLabel>
        <SearchableSelect
          id="ecn-product-category"
          onChange={(event) => {
            const nextCategory = event.currentTarget.value
            setCategory(nextCategory)
            setSubcategory("")
            const selected = items.find((item) => item.id === selectedItemId)
            if (nextCategory && selected?.category !== nextCategory) {
              setSelectedItemId("")
            }
          }}
          searchPlaceholder="Search category..."
          value={category}
        >
          <option value="">All Categories</option>
          {categories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SearchableSelect>
      </Field>

      <Field>
        <FieldLabel htmlFor="ecn-product-subcategory">Subcategory</FieldLabel>
        <SearchableSelect
          id="ecn-product-subcategory"
          onChange={(event) => {
            const nextSubcategory = event.currentTarget.value
            setSubcategory(nextSubcategory)
            const selected = items.find((item) => item.id === selectedItemId)
            if (nextSubcategory && selected?.subcategory !== nextSubcategory) {
              setSelectedItemId("")
            }
          }}
          searchPlaceholder="Search subcategory..."
          value={subcategory}
        >
          <option value="">All Subcategories</option>
          {subcategories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SearchableSelect>
      </Field>

      <Field>
        <FieldLabel htmlFor="ecn-product-name">Product Name</FieldLabel>
        <SearchableSelect
          id="ecn-product-name"
          name="item_id"
          onChange={(event) => selectProduct(event.currentTarget.value)}
          required
          searchPlaceholder="Search Product name..."
          value={value}
        >
          <option value="">Select Product</option>
          {visibleItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.description}
            </option>
          ))}
        </SearchableSelect>
      </Field>
    </div>
  )
}
