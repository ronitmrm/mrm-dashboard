"use client"

import { useState, useTransition, type ComponentProps } from "react"
import { StandardState } from "@workspace/ui/components/standard-state"

/** Keep entered values on a rejected save, and show server validation inline. */
export function MasterEntryForm({
  action,
  children,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => Promise<unknown>
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  return (
    <form
      {...props}
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        const form = event.currentTarget
        const data = new FormData(form)
        setError(undefined)
        startTransition(async () => {
          const result = await action(data)
          if (
            typeof result === "object" &&
            result !== null &&
            "error" in result &&
            typeof result.error === "string"
          ) {
            setError(result.error)
          } else {
            form.reset()
          }
        })
      }}
    >
      {error ? (
        <StandardState
          className="mb-4"
          variant="error"
          title="Entry not saved"
          description={error}
        />
      ) : null}
      <fieldset className="contents" disabled={pending} aria-busy={pending}>
        {children}
      </fieldset>
    </form>
  )
}
