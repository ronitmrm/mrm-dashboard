import { describe, expect, it } from "vitest"

import {
  beginSoftwareProcessing,
  createSoftwareProcessingFetch,
  isMutatingSoftwareRequest,
  softwareProcessingSnapshot,
} from "./software-processing"

describe("software processing state", () => {
  it("tracks overlapping mutations until every request finishes", () => {
    const finishFirst = beginSoftwareProcessing()
    const finishSecond = beginSoftwareProcessing()

    expect(softwareProcessingSnapshot()).toBe(true)
    finishFirst()
    expect(softwareProcessingSnapshot()).toBe(true)
    finishSecond()
    expect(softwareProcessingSnapshot()).toBe(false)
    finishSecond()
    expect(softwareProcessingSnapshot()).toBe(false)
  })

  it("locks only for mutating requests", () => {
    expect(isMutatingSoftwareRequest("/api/data", { method: "POST" })).toBe(true)
    expect(isMutatingSoftwareRequest("/api/data", { method: "PATCH" })).toBe(true)
    expect(isMutatingSoftwareRequest("/api/data")).toBe(false)
    expect(isMutatingSoftwareRequest(new Request("http://localhost/api/data", { method: "HEAD" }))).toBe(false)
  })

  it("keeps the software locked until a mutating fetch settles", async () => {
    let finishRequest: ((response: Response) => void) | undefined
    const originalFetch: typeof fetch = () => new Promise<Response>((resolve) => {
      finishRequest = resolve
    })
    const trackedFetch = createSoftwareProcessingFetch(originalFetch)

    const request = trackedFetch("http://localhost/api/save", { method: "POST" })
    expect(softwareProcessingSnapshot()).toBe(true)
    finishRequest?.(new Response(null, { status: 200 }))
    await request
    expect(softwareProcessingSnapshot()).toBe(false)
  })
})
