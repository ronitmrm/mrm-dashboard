import {
  artifactUploadOffsetHeader,
  parsePendingUploadIntent,
  pendingUploadFieldName,
  type PendingUploadIntent,
  type PendingUploadSafeProgress,
} from "./artifact-upload-contract"

export type RetainedUploadRegistration = {
  field: string
  uploadIdField?: string
  intent: PendingUploadIntent
  /** Store create targets are selected in the captured native form. */
  intentFields?: Partial<Record<"itemTypeId" | "supplierId", string>>
  /** Include the dynamically added BOM rows for this Design file purpose. */
  includeBomLines?: boolean
}

class UploadError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message)
  }
}

const chunkBytes = 4 * 1024 * 1024
const basePath = "/api/artifact-uploads"

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, credentials: "same-origin" })
  const body = await response.json()
  if (!response.ok) {
    throw new UploadError(
      body.error?.message ?? "Upload failed. Try submitting again.",
      body.error?.code ?? "provider_unavailable"
    )
  }
  return body as PendingUploadSafeProgress
}

function retryable(error: unknown) {
  return (
    !(error instanceof UploadError) ||
    ["provider_unavailable", "state_conflict"].includes(error.code)
  )
}

type CachedUpload = {
  file: File
  intentKey: string
  progress: PendingUploadSafeProgress
  submitted: boolean
}

/** One instance per native form. No file bytes or provider locators reach actions. */
export class PendingRetainedUploadClient {
  private uploads: CachedUpload[] = []
  private controller?: AbortController

  abandonUnused(data?: FormData) {
    if (!data) this.controller?.abort()
    const files = data
      ? new Set([...data.values()].filter((v) => v instanceof File))
      : undefined
    this.uploads = this.uploads.filter((upload) => {
      if (files?.has(upload.file)) return true
      if (!upload.submitted) {
        void fetch(`${basePath}/${upload.progress.uploadId}`, {
          method: "DELETE",
          credentials: "same-origin",
          keepalive: true,
        }).catch(() => undefined)
      }
      return false
    })
  }

  markSubmitted() {
    for (const upload of this.uploads) upload.submitted = true
  }

  async prepare(
    data: FormData,
    registrations: readonly RetainedUploadRegistration[],
    onProgress: (message: string) => void
  ) {
    this.abandonUnused(data)
    this.controller = new AbortController()
    const resolved = new Map(registrations.map((entry) => [entry.field, entry]))
    for (const entry of registrations) {
      if (
        !entry.includeBomLines ||
        entry.intent.kind !== "commercial-design-attachment"
      )
        continue
      for (const field of data.keys()) {
        const match =
          /^bom_line_([1-9]\d*)_(cad|customer_marked|internal_drawing)_file$/.exec(
            field
          )
        if (match && `${match[2]}_file` === entry.field) {
          resolved.set(field, {
            field,
            intent: { ...entry.intent, bomLineNumber: Number(match[1]) },
          })
        }
      }
    }
    const usedIds = new Set<string>()
    const result = new FormData()
    const positions = new Map<string, number>()
    for (const [field, value] of data) {
      const registration = resolved.get(field)
      if (!registration || !(value instanceof File)) {
        result.append(field, value)
        continue
      }
      // Native empty file controls are omitted just as the existing actions ignore them.
      if (!value.size) continue
      const index = (positions.get(field) ?? 0) + 1
      positions.set(field, index)
      const mapped = Object.fromEntries(
        Object.entries(registration.intentFields ?? {}).map(([key, name]) => [
          key,
          data.get(name),
        ])
      )
      const intent = parsePendingUploadIntent({
        ...registration.intent,
        ...mapped,
        ...(registration.intent.kind === "maintenance-request-photo"
          ? { index }
          : {}),
      })
      const uploadId = await this.upload(value, intent, onProgress)
      usedIds.add(uploadId)
      result.append(
        registration.uploadIdField ?? pendingUploadFieldName(field),
        uploadId
      )
    }
    this.uploads = this.uploads.filter((entry) => {
      if (usedIds.has(entry.progress.uploadId)) return true
      if (!entry.submitted)
        void fetch(`${basePath}/${entry.progress.uploadId}`, {
          method: "DELETE",
          credentials: "same-origin",
        }).catch(() => undefined)
      return false
    })
    return result
  }

  private async upload(
    file: File,
    intent: PendingUploadIntent,
    onProgress: (message: string) => void
  ) {
    const send = (path: string, init?: RequestInit) =>
      request(path, { ...init, signal: this.controller?.signal })
    const intentKey = JSON.stringify(intent)
    let cached = this.uploads.find(
      (entry) => entry.file === file && entry.intentKey === intentKey
    )
    try {
      if (cached) {
        cached.progress = await send(`${basePath}/${cached.progress.uploadId}`)
      } else {
        onProgress(`Preparing ${file.name}…`)
        const progress = await send(basePath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent,
            fileName: file.name,
            mediaType: file.type,
            byteSize: file.size,
          }),
        })
        cached = { file, intentKey, progress, submitted: false }
        this.uploads.push(cached)
      }
      const path = `${basePath}/${cached.progress.uploadId}`
      let recoveries = 0
      while (
        cached.progress.state === "uploading" &&
        cached.progress.confirmedOffset < file.size
      ) {
        const offset = cached.progress.confirmedOffset
        if (!Number.isSafeInteger(offset) || offset < 0)
          throw new Error("Invalid upload progress. Select the file again.")
        onProgress(
          `Uploading ${file.name} · ${Math.floor((offset / file.size) * 100)}%`
        )
        try {
          cached.progress = await send(path, {
            method: "PUT",
            headers: { [artifactUploadOffsetHeader]: String(offset) },
            body: file.slice(offset, Math.min(offset + chunkBytes, file.size)),
          })
        } catch (error) {
          if (!retryable(error) || recoveries++ >= 2) throw error
          cached.progress = await send(path)
        }
        if (cached.progress.confirmedOffset <= offset && recoveries++ >= 2) {
          throw new Error(
            "Upload paused. Check your connection and submit again to resume."
          )
        }
      }
      if (cached.progress.state === "uploading") {
        onProgress(`Verifying ${file.name}…`)
        try {
          cached.progress = await send(`${path}/complete`, { method: "POST" })
        } catch (error) {
          if (!retryable(error)) throw error
          cached.progress = await send(path)
          if (cached.progress.state === "uploading") {
            cached.progress = await send(`${path}/complete`, { method: "POST" })
          }
        }
      }
      if (!["ready", "finalized"].includes(cached.progress.state)) {
        throw new UploadError(
          "Upload is no longer available. Select the file again.",
          "expired"
        )
      }
      return cached.progress.uploadId
    } catch (error) {
      if (error instanceof UploadError && !retryable(error)) {
        this.uploads = this.uploads.filter((entry) => entry !== cached)
      }
      throw error
    }
  }
}
