"use client"

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type FormEvent,
} from "react"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  PendingRetainedUploadClient,
  type RetainedUploadRegistration,
} from "@/lib/pending-retained-upload-client"

export function usePendingRetainedUploads() {
  const [client] = useState(() => new PendingRetainedUploadClient())
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  useEffect(() => () => client.abandonUnused(), [client])
  return {
    client,
    feedback: error ? (
      <StandardState
        className="col-span-full basis-full"
        variant="error"
        title="Files not uploaded"
        description={error}
      />
    ) : message ? (
      <p
        className="col-span-full basis-full text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    ) : null,
    async prepare(
      data: FormData,
      uploads: readonly RetainedUploadRegistration[]
    ) {
      setError(undefined)
      try {
        const prepared = await client.prepare(data, uploads, setMessage)
        setMessage("Saving…")
        return prepared
      } catch (error) {
        setError(
          `${error instanceof Error ? error.message : "Upload interrupted."} Your selection is kept. Submit again to retry, or choose another file.`
        )
        return null
      }
    },
    finish() {
      setMessage(undefined)
    },
  }
}

export function capturedFormData(event: FormEvent<HTMLFormElement>) {
  const submitter = (event.nativeEvent as SubmitEvent).submitter
  return new FormData(event.currentTarget, submitter)
}

export function PendingRetainedUploadForm({
  action,
  children,
  uploads,
  onPendingChange,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (data: FormData) => void | Promise<unknown>
  uploads: readonly RetainedUploadRegistration[]
  onPendingChange?: (pending: boolean) => void
}) {
  const upload = usePendingRetainedUploads()
  const busy = useRef(false)
  const [pending, startTransition] = useTransition()
  return (
    <form
      {...props}
      onChange={(event) => {
        props.onChange?.(event)
        if (!busy.current)
          upload.client.abandonUnused(new FormData(event.currentTarget))
      }}
      onSubmit={(event) => {
        event.preventDefault()
        if (busy.current) return
        const form = event.currentTarget
        const data = capturedFormData(event)
        busy.current = true
        onPendingChange?.(true)
        startTransition(async () => {
          try {
            const prepared = await upload.prepare(data, uploads)
            if (!prepared) return
            // Action errors/Next redirects deliberately remain outside the transport catch.
            upload.client.markSubmitted()
            await action(prepared)
            form.reset()
            upload.client.abandonUnused()
          } finally {
            busy.current = false
            upload.finish()
            onPendingChange?.(false)
          }
        })
      }}
    >
      {upload.feedback}
      <fieldset className="contents" disabled={pending} aria-busy={pending}>
        {children}
      </fieldset>
    </form>
  )
}
