"use client"

import { useRef, useState, useTransition, type ComponentProps } from "react"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  capturedFormData,
  usePendingRetainedUploads,
} from "./pending-retained-upload-form"
import type { RetainedUploadRegistration } from "@/lib/pending-retained-upload-client"

/** Keep entered values on a rejected save, and show server validation inline. */
export function MasterEntryForm({
  action,
  children,
  uploads = [],
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => Promise<unknown>
  uploads?: readonly RetainedUploadRegistration[]
}) {
  const upload = usePendingRetainedUploads()
  const busy = useRef(false)
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  return (
    <form
      {...props}
      onChange={(event) => {
        props.onChange?.(event)
        if (!busy.current && uploads.length) {
          upload.client.abandonUnused(new FormData(event.currentTarget))
        }
      }}
      onSubmit={(event) => {
        event.preventDefault()
        if (busy.current) return
        const form = event.currentTarget
        const data = capturedFormData(event)
        busy.current = true
        setError(undefined)
        startTransition(async () => {
          try {
            const prepared = uploads.length
              ? await upload.prepare(data, uploads)
              : data
            if (!prepared) return
            upload.client.markSubmitted()
            const result = await action(prepared)
            if (
              typeof result === "object" &&
              result !== null &&
              "error" in result &&
              typeof result.error === "string"
            ) {
              setError(result.error)
            } else {
              form.reset()
              upload.client.abandonUnused()
            }
          } finally {
            busy.current = false
            upload.finish()
          }
        })
      }}
    >
      {upload.feedback}
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
