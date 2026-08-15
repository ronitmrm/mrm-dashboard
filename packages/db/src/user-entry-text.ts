const preservedFieldNames = new Set([
  "action",
  "actiontype",
  "actualreading",
  "approvalmode",
  "cardrole",
  "currency",
  "department",
  "endreason",
  "enteredrole",
  "entrytype",
  "expression",
  "filebase64",
  "floor",
  "fixture",
  "foamtool",
  "formula",
  "inputtype",
  "jobcard",
  "kind",
  "locale",
  "machine",
  "measurementmethod",
  "operator",
  "option",
  "part",
  "phase",
  "planningmode",
  "productionfloor",
  "returntab",
  "rescheduleaction",
  "role",
  "setup",
  "shopfloorstage",
  "source",
  "specification",
  "stage",
  "state",
  "target",
  "targettable",
  "timezone",
  "tooling",
  "type",
  "unit",
  "uom",
  "worker",
])

const identifierFieldSuffix = /(?:code|id|key|machine|no|number|option|setup)$/
const protectedFieldFragment =
  /(?:base64|email|file|href|mobile|password|path|phone|secret|token|uri|url)/
const isoDateOrTime =
  /^(?:\d{4}-\d{2}-\d{2}(?:[T ][0-9T:.+Z-]*)?|\d{1,2}:\d{2}(?::\d{2})?)$/i
const emailOrUrl = /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|(?:data|https?):\/\/)/i

export function properCaseUserText(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN")
  return cleaned
    .replace(
      /(^|[^\p{L}\p{N}])(\p{L})/gu,
      (_, boundary: string, letter: string) =>
        `${boundary}${letter.toLocaleUpperCase("en-IN")}`
    )
    .replace(
      /(['’])(S|T|Re|Ve|Ll|D|M)\b/g,
      (_, apostrophe: string, suffix: string) =>
        `${apostrophe}${suffix.toLocaleLowerCase("en-IN")}`
    )
}

export function normalizeUserEnteredPayload<T>(value: T, fieldName = ""): T {
  if (typeof value === "string") {
    return normalizeUserEnteredString(value, fieldName) as T
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      normalizeUserEnteredPayload(item, fieldName)
    ) as T
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeUserEnteredPayload(item, key),
      ])
    ) as T
  }
  return value
}

export function preservesUserEnteredTextCase(fieldName: string) {
  const normalizedFieldName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, "")
  return (
    preservedFieldNames.has(normalizedFieldName) ||
    identifierFieldSuffix.test(normalizedFieldName) ||
    protectedFieldFragment.test(normalizedFieldName)
  )
}

function normalizeUserEnteredString(value: string, fieldName: string) {
  if (fieldName.toLowerCase().replace(/[^a-z0-9]/g, "") === "filebase64") {
    return value
  }
  const cleaned = value.trim()
  if (
    !cleaned ||
    preservesUserEnteredTextCase(fieldName) ||
    isoDateOrTime.test(cleaned) ||
    emailOrUrl.test(cleaned)
  ) {
    return cleaned
  }
  return properCaseUserText(cleaned)
}
