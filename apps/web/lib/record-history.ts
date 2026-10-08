type RecordBody = Record<string, unknown>

// Keep requests bounded while presenting the complete register as one list.
export async function readRecordHistory(
  url: URL,
  response: Response,
  body: RecordBody,
  signal: AbortSignal
) {
  const initialBody = body
  let page: unknown[] = Array.isArray(body.rows) ? body.rows : []
  const history: unknown[] = [...page]
  const limit = Math.min(Math.max(Math.trunc(Number(url.searchParams.get("limit")) || 500), 1), 500)
  let offset = Math.max(Math.trunc(Number(url.searchParams.get("offset")) || 0), 0)
  const nextUrl = new URL(url)
  nextUrl.searchParams.delete("conditional")
  nextUrl.searchParams.delete("knownSourceRevision")
  nextUrl.searchParams.delete("includeEvents")

  while (response.ok && page.length === limit) {
    offset += page.length
    nextUrl.searchParams.set("offset", String(offset))
    response = await fetch(nextUrl.toString(), {
      cache: "no-store",
      credentials: "same-origin",
      signal,
    })
    body = await response.json().catch(() => ({})) as RecordBody
    if (!response.ok) return { response, body }
    page = Array.isArray(body.rows) ? body.rows : []
    history.push(...page)
  }

  return { response, body: { ...initialBody, rows: history } }
}
