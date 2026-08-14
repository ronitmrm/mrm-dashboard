"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

type SearchableSelectProps = Omit<
  React.ComponentProps<"select">,
  "multiple" | "size"
> & {
  emptyMessage?: string
  searchPlaceholder?: string
  size?: "sm" | "default"
}

type SearchableOption = {
  disabled: boolean
  group?: string
  label: string
  value: string
}

function nodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node)
  }
  if (Array.isArray(node)) return node.map(nodeText).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return nodeText(node.props.children)
  }
  return ""
}

function collectOptions(
  children: React.ReactNode,
  group?: string
): SearchableOption[] {
  const options: SearchableOption[] = []

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    const props = child.props as {
      children?: React.ReactNode
      disabled?: boolean
      label?: string
      value?: string | number
    }
    const isOption = child.type === "option" || props.value !== undefined
    if (isOption) {
      const label = nodeText(props.children).trim()
      options.push({
        disabled: Boolean(props.disabled),
        group,
        label,
        value: String(props.value ?? label),
      })
      return
    }

    const nextGroup =
      child.type === "optgroup" || props.label ? props.label ?? group : group
    options.push(...collectOptions(props.children, nextGroup))
  })

  return options
}

function SearchableSelect({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  children,
  className,
  defaultValue,
  disabled,
  emptyMessage = "No matching options",
  id,
  onChange,
  onInvalid,
  required,
  searchPlaceholder = "Type to filter...",
  size = "default",
  value,
  ...props
}: SearchableSelectProps) {
  const options = React.useMemo(() => collectOptions(children), [children])
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = React.useState(() =>
    String(defaultValue ?? options[0]?.value ?? "")
  )
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const selectRef = React.useRef<HTMLSelectElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const selectedValue = isControlled
    ? String(value ?? "")
    : options.some((option) => option.value === internalValue)
      ? internalValue
      : String(defaultValue ?? options[0]?.value ?? "")
  const selectedOption = options.find(
    (option) => option.value === selectedValue
  )
  const placeholder =
    options.find((option) => option.value === "")?.label || "Select option"
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        [option.label, option.value, option.group]
          .filter(Boolean)
          .some((text) =>
            String(text).toLocaleLowerCase().includes(normalizedQuery)
          )
      )
    : options

  React.useEffect(() => {
    const select = selectRef.current
    const form = select?.form
    if (!form || isControlled) return
    const reset = () => {
      window.setTimeout(() => setInternalValue(select.value), 0)
    }
    form.addEventListener("reset", reset)
    return () => form.removeEventListener("reset", reset)
  }, [isControlled])

  function selectValue(nextValue: string) {
    const select = selectRef.current
    if (!select) return
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )?.set
    valueSetter?.call(select, nextValue)
    select.dispatchEvent(new Event("change", { bubbles: true }))
    if (!isControlled) setInternalValue(nextValue)
    setOpen(false)
    setQuery("")
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setQuery("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          aria-describedby={ariaDescribedBy}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-required={required}
          className={cn(
            "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-3xl border border-input bg-background py-1 pr-3 pl-3 text-sm shadow-xs transition-[color,box-shadow,background-color,border-color] outline-none hover:border-primary/45 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[size=sm]:h-8 dark:bg-input/20 dark:hover:border-primary/60",
            className
          )}
          data-size={size}
          data-slot="searchable-select"
          disabled={disabled}
          ref={triggerRef}
          type="button"
        >
          <span
            className={cn(
              "truncate",
              !selectedOption && "text-muted-foreground"
            )}
          >
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-56 gap-1 rounded-lg p-1"
      >
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            aria-label="Filter options"
            autoFocus
            className="h-9 w-full rounded-md border border-input bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            type="search"
            value={query}
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1" role="listbox">
          {filteredOptions.length ? (
            filteredOptions.map((option, index) => {
              const previousGroup = filteredOptions[index - 1]?.group
              return (
                <React.Fragment key={`${option.group ?? ""}-${option.value}-${index}`}>
                  {option.group && option.group !== previousGroup ? (
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      {option.group}
                    </div>
                  ) : null}
                  <button
                    aria-selected={option.value === selectedValue}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                    disabled={option.disabled}
                    onClick={() => selectValue(option.value)}
                    role="option"
                    type="button"
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {option.value === selectedValue ? (
                      <CheckIcon aria-hidden="true" className="size-4 shrink-0" />
                    ) : null}
                  </button>
                </React.Fragment>
              )
            })
          ) : (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}
        </div>
      </PopoverContent>
      <select
        {...props}
        aria-describedby={ariaDescribedBy}
        aria-hidden="true"
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className="sr-only"
        defaultValue={defaultValue}
        disabled={disabled}
        id={id}
        onChange={(event) => {
          if (!isControlled) setInternalValue(event.target.value)
          onChange?.(event)
        }}
        onFocus={() => triggerRef.current?.focus()}
        onInvalid={(event) => {
          onInvalid?.(event)
          triggerRef.current?.focus()
        }}
        ref={selectRef}
        required={required}
        tabIndex={-1}
        value={value}
      >
        {children}
      </select>
    </Popover>
  )
}

export { SearchableSelect, type SearchableSelectProps }
