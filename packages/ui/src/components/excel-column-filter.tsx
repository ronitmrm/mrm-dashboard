"use client"

import { useMemo, useState } from "react"
import { ListFilter } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

export function uniqueFilterOptions(
  values: Array<string | null | undefined>
) {
  return [...new Set(values.map((value) => value?.trim() || "—"))].sort(
    (left, right) => left.localeCompare(right, "en-IN", { numeric: true })
  )
}

export function matchesColumnFilter(
  value: string | null | undefined,
  selected: string[] | null
) {
  return selected === null || selected.includes(value?.trim() || "—")
}

export function ExcelColumnFilter({
  allLabel = "All",
  label,
  onApply,
  options,
  selected,
}: {
  allLabel?: string
  label: string
  onApply: (selected: string[] | null) => void
  options: string[]
  selected: string[] | null
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState<string[]>(selected ?? options)

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en-IN")
    return normalized
      ? options.filter((option) =>
          option.toLocaleLowerCase("en-IN").includes(normalized)
        )
      : options
  }, [options, query])
  const allVisibleSelected =
    visible.length > 0 && visible.every((option) => draft.includes(option))
  const someVisibleSelected = visible.some((option) => draft.includes(option))

  function toggleVisible(checked: boolean) {
    const visibleSet = new Set(visible)
    setDraft((current) =>
      checked
        ? [...new Set([...current, ...visible])]
        : current.filter((value) => !visibleSet.has(value))
    )
  }

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setDraft(selected ?? options)
          setQuery("")
        }
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label={`Filter ${label}`}
          className="h-8 min-w-20 justify-between gap-2 px-2 text-xs font-normal"
          size="sm"
          type="button"
          variant={selected === null ? "outline" : "default"}
        >
          {selected === null ? allLabel : `${selected.length} selected`}
          <ListFilter className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3 p-3">
        <p className="text-sm font-medium">Filter {label}</p>
        <Input
          aria-label={`Search ${label} values`}
          className="h-8 text-xs"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Values..."
          value={query}
        />
        <label className="flex cursor-pointer items-center gap-2 border-b pb-2 text-xs font-medium">
          <Checkbox
            checked={
              allVisibleSelected
                ? true
                : someVisibleSelected
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(checked) => toggleVisible(checked === true)}
          />
          Select All{query ? " matching" : ""}
        </label>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {visible.map((option) => (
            <label
              className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-muted"
              key={option}
            >
              <Checkbox
                checked={draft.includes(option)}
                onCheckedChange={(checked) =>
                  setDraft((current) =>
                    checked === true
                      ? [...new Set([...current, option])]
                      : current.filter((value) => value !== option)
                  )
                }
              />
              <span className="truncate" title={option}>
                {option}
              </span>
            </label>
          ))}
          {!visible.length ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No Values Found.
            </p>
          ) : null}
        </div>
        <div className="flex justify-between gap-2 border-t pt-2">
          <Button
            onClick={() => {
              onApply(null)
              setOpen(false)
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear
          </Button>
          <Button
            onClick={() => {
              onApply(draft.length === options.length ? null : draft)
              setOpen(false)
            }}
            size="sm"
            type="button"
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
