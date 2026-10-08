import { afterEach, expect, test, vi } from "vitest"

import { readRecordHistory } from "./record-history"

afterEach(() => vi.unstubAllGlobals())

const url = new URL("https://example.test/api/production-sessions?floor=cnc&limit=500&conditional=1&includeEvents=1&knownSourceRevision=old")
const recentRows = Array.from({ length: 500 }, (_, id) => ({ id: String(id), partCode: "recent" }))

test("loads all older sessions automatically and retains the conditional revision and events", async () => {
  const olderRows = Array.from({ length: 500 }, (_, id) => ({ id: String(id + 500), partCode: "R73" }))
  const oldest = { id: "1000", partCode: "R73" }
  const fetchPage = vi.fn()
    .mockResolvedValueOnce(Response.json({ rows: olderRows }))
    .mockResolvedValueOnce(Response.json({ rows: [oldest] }))
  vi.stubGlobal("fetch", fetchPage)
  const initialBody = { rows: recentRows, sourceRevision: "current", events: [{ eventId: "event" }] }
  const signal = new AbortController().signal

  const result = await readRecordHistory(url, Response.json(initialBody), initialBody, signal)

  expect(result.body).toEqual({ ...initialBody, rows: [...recentRows, ...olderRows, oldest] })
  expect(fetchPage.mock.calls.map(([request]) => new URL(request).searchParams.get("offset"))).toEqual(["500", "1000"])
  const [request, options] = fetchPage.mock.calls[0]!
  expect([...new URL(request).searchParams]).toEqual([["floor", "cnc"], ["limit", "500"], ["offset", "500"]])
  expect(options).toEqual({ cache: "no-store", credentials: "same-origin", signal })
})

test("returns access denial from an older batch instead of presenting incomplete history", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "Access denied" }, { status: 403 })))

  const result = await readRecordHistory(url, Response.json({}), { rows: recentRows }, new AbortController().signal)

  expect(result.response.status).toBe(403)
  expect(result.body).toEqual({ error: "Access denied" })
})
