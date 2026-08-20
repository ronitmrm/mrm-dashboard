export type SalesTaskType =
  | "Follow-Up"
  | "Technical Handover"
  | "Quote Ready"
  | "Sales Clarification"

export type SalesTaskRow = {
  action: "followup" | "handover" | "quote" | "clarification"
  companyName: string
  customerUid: string
  details: string
  enquiryId: string
  enquiryNumber: string
  key: string
  line: string
  sourceId: string
  status: "Blocked" | "Open" | "Pending" | "Ready"
  taskDate: string
  taskType: SalesTaskType
}

type ClarificationTask = {
  clarificationTaskId: string
  companyName: string
  customerPartCode: string
  customerUid: string
  enquiryId: string
  enquiryItemId: string
  enquiryNumber: string
  lineNumber: number
  question: string
}

type FollowupTask = {
  channel: string
  companyName: string
  customerUid: string
  dueOn: string
  enquiryId: string
  enquiryNumber: string
  id: string
  note: string
  quoteNumber: string | null
  status: string
}

type HandoverTask = {
  companyName: string
  conversionRate: number
  currency: string | null
  customerUid: string
  enquiryId: string
  enquiryNumber: string
  incoterms: string | null
  packagingTerms: string | null
  paymentTerms: string | null
  receivedOn: string
  salesHoldLines: number
  shipmentMode: string | null
  totalLines: number
}

type QuoteReadyTask = {
  companyName: string
  currency: string
  customerUid: string
  enquiryId: string
  enquiryNumber: string
  latestQuoteAt: Date | null
  notQuotedLines: number
  quotedLines: number
}

function handoverMissingFields(task: HandoverTask) {
  return [
    !task.incoterms ? "Incoterms" : "",
    !task.paymentTerms ? "Payment terms" : "",
    !task.shipmentMode ? "Shipment mode" : "",
    !task.packagingTerms ? "Packaging" : "",
    !task.currency ? "Currency" : "",
    task.conversionRate <= 0 ? "FX rate" : "",
    task.salesHoldLines > 0 ? `${task.salesHoldLines} sales hold line(s)` : "",
  ].filter(Boolean)
}

function dateValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : ""
}

export function salesTaskRows({
  clarifications,
  followups,
  handovers,
  quoteReady,
}: {
  clarifications: ClarificationTask[]
  followups: FollowupTask[]
  handovers: HandoverTask[]
  quoteReady: QuoteReadyTask[]
}): SalesTaskRow[] {
  const rows: SalesTaskRow[] = [
    ...followups
      .filter((followup) => followup.status === "Pending")
      .map((followup): SalesTaskRow => ({
        action: "followup",
        companyName: followup.companyName,
        customerUid: followup.customerUid,
        details: [followup.channel, followup.quoteNumber, followup.note]
          .filter(Boolean)
          .join(" · "),
        enquiryId: followup.enquiryId,
        enquiryNumber: followup.enquiryNumber,
        key: `followup:${followup.id}`,
        line: "—",
        sourceId: followup.id,
        status: "Pending",
        taskDate: followup.dueOn,
        taskType: "Follow-Up",
      })),
    ...handovers.map((handover): SalesTaskRow => {
      const missing = handoverMissingFields(handover)
      return {
        action: "handover",
        companyName: handover.companyName,
        customerUid: handover.customerUid,
        details: missing.length
          ? `Missing ${missing.join(", ")}`
          : `${handover.totalLines} line(s) ready`,
        enquiryId: handover.enquiryId,
        enquiryNumber: handover.enquiryNumber,
        key: `handover:${handover.enquiryId}`,
        line: "—",
        sourceId: handover.enquiryId,
        status: missing.length ? "Blocked" : "Ready",
        taskDate: handover.receivedOn,
        taskType: "Technical Handover",
      }
    }),
    ...quoteReady.map((quote): SalesTaskRow => ({
      action: "quote",
      companyName: quote.companyName,
      customerUid: quote.customerUid,
      details: `${quote.quotedLines} quoted · ${quote.notQuotedLines} not feasible · ${quote.currency}`,
      enquiryId: quote.enquiryId,
      enquiryNumber: quote.enquiryNumber,
      key: `quote:${quote.enquiryId}`,
      line: "—",
      sourceId: quote.enquiryId,
      status: "Ready",
      taskDate: dateValue(quote.latestQuoteAt),
      taskType: "Quote Ready",
    })),
    ...clarifications.map((clarification): SalesTaskRow => ({
      action: "clarification",
      companyName: clarification.companyName,
      customerUid: clarification.customerUid,
      details: `${clarification.customerPartCode} · ${clarification.question}`,
      enquiryId: clarification.enquiryId,
      enquiryNumber: clarification.enquiryNumber,
      key: `clarification:${clarification.clarificationTaskId}`,
      line: `Line ${clarification.lineNumber}`,
      sourceId: clarification.enquiryItemId,
      status: "Open",
      taskDate: "",
      taskType: "Sales Clarification",
    })),
  ]

  return rows.sort(
    (left, right) =>
      right.taskDate.localeCompare(left.taskDate) ||
      left.taskType.localeCompare(right.taskType) ||
      left.enquiryNumber.localeCompare(right.enquiryNumber, "en-IN", {
        numeric: true,
      })
  )
}
