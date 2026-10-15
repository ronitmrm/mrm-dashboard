"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  ArrowDown,
  ArrowDownAZ,
  ArrowDownZA,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ListFilter,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  matchesTableColumnFilter,
  prepareFilterDraftForSearch,
  uniqueTableFilterOptions,
  type TableSortDirection,
} from "@workspace/ui/lib/table-filter-state"
import {
  groupTableFilterDates,
  tableDateSearchText,
} from "@workspace/ui/lib/table-date-filter"
import { cn } from "@workspace/ui/lib/utils"

function DateFilterBranch({
  label,
  name,
  checked,
  expanded,
  onToggle,
  onCheckedChange,
  children,
}: {
  label: string
  name: string
  checked: boolean | "indeterminate"
  expanded: boolean
  onToggle: () => void
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <li>
      <div className="flex items-center gap-1">
        <Button
          aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
          aria-expanded={expanded}
          onClick={onToggle}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </Button>
        <label className="flex flex-1 cursor-pointer items-center gap-2 py-1 text-xs">
          <Checkbox
            aria-label={`Select ${name}`}
            checked={checked}
            onCheckedChange={(value) => onCheckedChange(value === true)}
          />
          {label}
        </label>
      </div>
      {expanded ? (
        <ul aria-label={name} className="ml-3 border-l pl-3">
          {children}
        </ul>
      ) : null}
    </li>
  )
}

export function uniqueFilterOptions(values: Array<string | null | undefined>) {
  return uniqueTableFilterOptions(values)
}

export function matchesColumnFilter(
  value: string | null | undefined,
  selected: string[] | null
) {
  return matchesTableColumnFilter(value, selected)
}

export function ExcelColumnFilter({
  allLabel = "All",
  label,
  onApply,
  onSort,
  options,
  selected,
  sortDirection,
}: {
  allLabel?: string
  label: string
  onApply: (selected: string[] | null) => void
  onSort?: (direction: TableSortDirection) => void
  options: string[]
  selected: string[] | null
  sortDirection?: TableSortDirection
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState<string[]>(selected ?? options)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const dateOptions = useMemo(() => groupTableFilterDates(options), [options])
  const isDateColumn = dateOptions.years.length > 0
  const draftSet = useMemo(() => new Set(draft), [draft])

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("en-IN")
    return normalized
      ? options.filter((option) =>
          (isDateColumn ? tableDateSearchText(option) : option)
            .toLocaleLowerCase("en-IN")
            .includes(normalized)
        )
      : options
  }, [options, query, isDateColumn])
  const visibleDates = useMemo(() => groupTableFilterDates(visible), [visible])
  const allVisibleSelected =
    visible.length > 0 && visible.every((option) => draft.includes(option))
  const someVisibleSelected = visible.some((option) => draft.includes(option))

  function toggleValues(values: string[], checked: boolean) {
    const visibleSet = new Set(values)
    setDraft((current) =>
      checked
        ? [...new Set([...current, ...values])]
        : current.filter((value) => !visibleSet.has(value))
    )
  }

  function checkedState(values: string[]) {
    return values.every((value) => draftSet.has(value))
      ? true
      : values.some((value) => draftSet.has(value))
        ? "indeterminate"
        : false
  }

  function toggleExpanded(key: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setDraft(selected ?? options)
          setQuery("")
          setExpanded(
            new Set(
              dateOptions.years[0] ? [String(dateOptions.years[0].year)] : []
            )
          )
        }
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <Button
          aria-label={`Filter ${label}`}
          className="h-8 min-w-20 justify-between gap-2 px-2 text-xs font-normal data-[filter-applied=true]:border-[var(--color-filter-applied)] data-[filter-applied=true]:bg-[var(--color-filter-applied-bg)] data-[sort-direction]:ring-1 data-[sort-direction]:ring-[var(--color-filter-applied)]/30"
          data-filter-applied={selected === null ? undefined : "true"}
          data-sort-direction={sortDirection}
          size="sm"
          type="button"
          variant={selected === null ? "outline" : "default"}
        >
          {selected === null ? allLabel : `${selected.length} selected`}
          <ListFilter className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-3 p-3 data-closed:hidden",
          isDateColumn && "w-[min(22rem,calc(100vw-2rem))]"
        )}
      >
        <p className="text-sm font-medium">Filter {label}</p>
        {onSort ? (
          <div
            className={cn(
              "grid grid-cols-2 gap-1 border-b pb-2",
              isDateColumn && "grid-cols-1"
            )}
          >
            <Button
              onClick={() => {
                onSort("asc")
                setOpen(false)
              }}
              size="sm"
              type="button"
              variant={sortDirection === "asc" ? "secondary" : "ghost"}
            >
              {isDateColumn ? (
                <ArrowUp data-icon="inline-start" />
              ) : (
                <ArrowDownAZ data-icon="inline-start" />
              )}
              {isDateColumn ? "Sort Oldest to Newest" : "Sort A–Z"}
            </Button>
            <Button
              onClick={() => {
                onSort("desc")
                setOpen(false)
              }}
              size="sm"
              type="button"
              variant={sortDirection === "desc" ? "secondary" : "ghost"}
            >
              {isDateColumn ? (
                <ArrowDown data-icon="inline-start" />
              ) : (
                <ArrowDownZA data-icon="inline-start" />
              )}
              {isDateColumn ? "Sort Newest to Oldest" : "Sort Z–A"}
            </Button>
          </div>
        ) : null}
        <Input
          aria-label={`Search ${label} values`}
          className="h-8 text-xs"
          onChange={(event) => {
            const nextQuery = event.target.value
            setDraft((current) =>
              prepareFilterDraftForSearch({
                draft: current,
                nextQuery,
                options,
                previousQuery: query,
              })
            )
            setQuery(nextQuery)
          }}
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
            onCheckedChange={(checked) =>
              toggleValues(visible, checked === true)
            }
          />
          Select All{query ? " matching" : ""}
        </label>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {isDateColumn ? (
            <ul aria-label={`${label} dates`}>
              {visibleDates.years.map((year) => (
                <DateFilterBranch
                  key={year.year}
                  label={String(year.year)}
                  name={String(year.year)}
                  checked={checkedState(year.values)}
                  expanded={
                    Boolean(query.trim()) || expanded.has(String(year.year))
                  }
                  onToggle={() => toggleExpanded(String(year.year))}
                  onCheckedChange={(checked) =>
                    toggleValues(year.values, checked)
                  }
                >
                  {year.months.map((month) => (
                    <DateFilterBranch
                      key={month.month}
                      label={month.label}
                      name={`${month.label} ${year.year}`}
                      checked={checkedState(month.values)}
                      expanded={
                        Boolean(query.trim()) ||
                        expanded.has(`${year.year}-${month.month}`)
                      }
                      onToggle={() =>
                        toggleExpanded(`${year.year}-${month.month}`)
                      }
                      onCheckedChange={(checked) =>
                        toggleValues(month.values, checked)
                      }
                    >
                      {month.days.map((day) => (
                        <li key={day.day}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
                            <Checkbox
                              aria-label={`Select ${day.day} ${month.label} ${year.year}`}
                              checked={checkedState(day.values)}
                              onCheckedChange={(checked) =>
                                toggleValues(day.values, checked === true)
                              }
                            />
                            {day.day}
                          </label>
                        </li>
                      ))}
                    </DateFilterBranch>
                  ))}
                </DateFilterBranch>
              ))}
            </ul>
          ) : null}
          {(isDateColumn ? visibleDates.otherValues : visible).map((option) => (
            <label
              className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-muted"
              key={option}
            >
              <Checkbox
                checked={draftSet.has(option)}
                onCheckedChange={(checked) =>
                  toggleValues([option], checked === true)
                }
              />
              <span className="min-w-0 break-words" title={option}>
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
          <div className="flex gap-2">
            {isDateColumn ? (
              <Button
                onClick={() => setOpen(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            ) : null}
            <Button
              onClick={() => {
                onApply(
                  draft.length === options.length &&
                    options.every((option) => draft.includes(option))
                    ? null
                    : draft
                )
                setOpen(false)
              }}
              size="sm"
              type="button"
            >
              {isDateColumn ? "OK" : "Apply"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
