"use client"

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import Image from "next/image"
import { Trash2 } from "lucide-react"
import type { MaintenanceWorkPhotoTarget } from "@workspace/db"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { usePendingRetainedUploads } from "@/components/pending-retained-upload-form"
import { maintenanceWorkPhotoQuery } from "@/lib/maintenance-work-photo-target"

type Photo = { fileName: string; id: string; url: string }

export type MaintenanceWorkPhotosHandle = {
  hasPending: () => boolean
  uploadPending: () => Promise<void>
}

export const MaintenanceWorkPhotos = forwardRef<MaintenanceWorkPhotosHandle, {
  disabled?: boolean
  target: MaintenanceWorkPhotoTarget
}>(function MaintenanceWorkPhotos({ disabled, target }, ref) {
  const upload = usePendingRetainedUploads()
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [error, setError] = useState("")
  const [removingId, setRemovingId] = useState<string | null>(null)
  const query = maintenanceWorkPhotoQuery(target)

  async function removePhoto(photo: Photo) {
    setError("")
    setRemovingId(photo.id)
    try {
      const response = await fetch(`/api/maintenance/work-photos/${photo.id}?${query}`, { method: "DELETE" })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error || "Photo could not be removed.")
      setPhotos((current) => current.filter((item) => item.id !== photo.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Photo could not be removed.")
    } finally {
      setRemovingId(null)
    }
  }

  useEffect(() => {
    let active = true
    void fetch(`/api/maintenance/work-photos?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { error?: string; photos?: Photo[] }
        if (!response.ok) throw new Error(result.error || "Photos could not be loaded.")
        return result.photos ?? []
      })
      .then((loaded) => { if (active) setPhotos(loaded) })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Photos could not be loaded.")
      })
    return () => { active = false }
  }, [query])

  useImperativeHandle(ref, () => ({
    hasPending: () => files.length > 0,
    async uploadPending() {
      if (!files.length) return
      setError("")
      if (files.length + photos.length > 8) {
        const message = "Attach no more than eight photos to this maintenance job."
        setError(message)
        throw new Error(message)
      }
      const data = new FormData()
      for (const file of files) data.append("photos", file)
      const prepared = await upload.prepare(data, [{
        field: "photos",
        intent: { index: 1, kind: "maintenance-work-photo" },
      }])
      if (!prepared) throw new Error("Photos could not be uploaded. Retry with the selected files.")
      const uploadIds = prepared.getAll("photos_upload_id").map(String)
      try {
        const response = await fetch("/api/maintenance/work-photos", {
          body: JSON.stringify({ target, uploadIds }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
        const result = (await response.json()) as { error?: string; photos?: Photo[] }
        if (!response.ok) throw new Error(result.error || "Photos could not be saved.")
        upload.client.markSubmitted()
        upload.finish()
        setPhotos(result.photos ?? [])
        setFiles([])
        if (inputRef.current) inputRef.current.value = ""
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Photos could not be saved."
        setError(message)
        throw cause
      }
    },
  }), [files, photos, target, upload])

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="maintenance-work-photos">Photos of work done</Label>
        <Input
          accept="image/jpeg,image/png"
          disabled={disabled || removingId !== null}
          id="maintenance-work-photos"
          multiple
          onChange={(event) => {
            setError("")
            setFiles(Array.from(event.target.files ?? []))
          }}
          ref={inputRef}
          type="file"
        />
        <p className="text-xs text-muted-foreground">Up to eight JPG or PNG photos, 10 MB each. Selected photos save with this maintenance job.</p>
      </div>
      {files.length ? (
        <ul className="grid gap-1.5">
          {files.map((file, index) => (
            <li className="flex min-w-0 items-center gap-2 text-sm" key={`${file.name}-${index}`}>
              <span className="min-w-0 truncate">{file.name}</span>
              <Button
                aria-label={`Remove selected photo ${file.name}`}
                disabled={disabled || removingId !== null}
                onClick={() => {
                  setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))
                  if (inputRef.current) inputRef.current.value = ""
                }}
                size="xs"
                type="button"
                variant="outline"
              >
                <Trash2 aria-hidden="true" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {photos.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <li className="grid gap-1.5" key={photo.id}>
              <a className="grid gap-1.5 text-sm underline underline-offset-4" href={photo.url} rel="noopener noreferrer" target="_blank">
                <Image alt={photo.fileName} className="h-32 w-full rounded-md border object-cover" height={128} src={photo.url} unoptimized width={192} />
                <span className="break-all">{photo.fileName}</span>
              </a>
              <Button
                aria-label={`Remove saved photo ${photo.fileName}`}
                className="w-fit"
                disabled={disabled || removingId !== null}
                onClick={() => void removePhoto(photo)}
                size="xs"
                type="button"
                variant="outline"
              >
                <Trash2 aria-hidden="true" /> {removingId === photo.id ? "Removing…" : "Remove"}
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No photos saved for this job.</p>}
      {upload.feedback}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  )
})
