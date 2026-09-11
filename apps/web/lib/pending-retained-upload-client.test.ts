import { afterEach, expect, it, vi } from "vitest"
import { PendingRetainedUploadClient } from "./pending-retained-upload-client"

afterEach(() => vi.unstubAllGlobals())

it("preserves form order and repeated values, resumes confirmed chunks, and reuses the same selection", async () => {
  let offset = 0
  let ready = false
  let interrupted = false
  const chunks: number[] = []
  const starts: unknown[] = []
  const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
    if (init?.method === "POST" && _path.endsWith("/artifact-uploads"))
      starts.push(JSON.parse(String(init.body)))
    if (init?.method === "PUT") {
      const size = (init.body as Blob).size
      expect(init.headers).toEqual({ "Upload-Offset": String(offset) })
      chunks.push(size)
      offset += size
      if (!interrupted) {
        interrupted = true
        throw new TypeError("Connection lost after acknowledgement")
      }
    }
    if (_path.endsWith("/complete")) ready = true
    return Response.json({
      uploadId: "upload-1",
      confirmedOffset: offset,
      state: ready ? "ready" : "uploading",
    })
  })
  vi.stubGlobal("fetch", fetchMock)
  const file = new File([new Uint8Array(5 * 1024 * 1024)], " original.pdf ", {
    type: "",
  })
  const data = new FormData()
  data.append("selected", "first")
  data.append("resume", file)
  data.append("selected", "second")
  data.append("save_intent", "draft")
  const uploads = [
    {
      field: "resume",
      intent: { kind: "recruitment-candidate-resume" as const },
    },
  ]
  const client = new PendingRetainedUploadClient()
  const prepared = await client.prepare(data, uploads, () => undefined)
  expect([...prepared]).toEqual([
    ["selected", "first"],
    ["resume_upload_id", "upload-1"],
    ["selected", "second"],
    ["save_intent", "draft"],
  ])
  expect(chunks).toEqual([4 * 1024 * 1024, 1024 * 1024])
  expect(starts).toEqual([
    {
      intent: { kind: "recruitment-candidate-resume" },
      fileName: " original.pdf ",
      mediaType: "",
      byteSize: file.size,
    },
  ])
  expect([...(await client.prepare(data, uploads, () => undefined))]).toEqual([
    ...prepared,
  ])
  expect(starts).toHaveLength(1)
})

it("keeps original selection on rejection and starts fresh after an expired ID", async () => {
  let starts = 0
  let reject = true
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST" && path.endsWith("/artifact-uploads")) {
        starts++
        return Response.json({
          uploadId: `upload-${starts}`,
          confirmedOffset: 0,
          state: "uploading",
        })
      }
      if (reject)
        return Response.json(
          { error: { code: "expired", message: "Upload expired." } },
          { status: 410 }
        )
      return Response.json({
        uploadId: `upload-${starts}`,
        confirmedOffset: 3,
        state: path.endsWith("/complete") ? "ready" : "uploading",
      })
    })
  )
  const data = new FormData()
  const file = new File(["pdf"], "resume.pdf")
  data.append("resume", file)
  const uploads = [
    {
      field: "resume",
      intent: { kind: "recruitment-candidate-resume" as const },
    },
  ]
  const client = new PendingRetainedUploadClient()
  await expect(client.prepare(data, uploads, () => undefined)).rejects.toThrow(
    "Upload expired."
  )
  expect(data.get("resume")).toBe(file)
  reject = false
  expect(
    (await client.prepare(data, uploads, () => undefined)).get(
      "resume_upload_id"
    )
  ).toBe("upload-2")
  expect(starts).toBe(2)
})
