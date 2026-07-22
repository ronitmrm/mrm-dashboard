import * as XLSX from "xlsx"

type Followup = {
  channel: string
  companyName: string
  customerUid: string
  dueOn: string
  enquiryNumber: string
  note: string
  quoteNumber: string | null
  status: string
}

type SentQuote = {
  companyName: string
  currency: string
  customerUid: string
  enquiryId: string
  enquiryNumber: string
  latestSentAt: Date
  nextFollowupDue: string | null
  pendingFollowups: number
  sentQuoteItems: number
  totalLines: number
}

export function buildFollowupHistoryWorkbook(rows: Followup[]) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      "Due Date": row.dueOn,
      ENQ: row.enquiryNumber,
      "Quote UID": row.quoteNumber ?? "",
      Customer: row.companyName,
      Channel: row.channel,
      Notes: row.note,
    }))
  )
  XLSX.utils.book_append_sheet(workbook, sheet, "Follow-up History")
  return workbook
}

export function buildSentQuoteHistoryWorkbook(rows: SentQuote[]) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      ENQ: row.enquiryNumber,
      "Customer UID": row.customerUid,
      Customer: row.companyName,
      Currency: row.currency,
      Lines: row.totalLines,
      "Quote Items Sent": row.sentQuoteItems,
      "PDF Sent At": row.latestSentAt.toISOString(),
      "Next Follow-up": row.nextFollowupDue ?? "",
      "Pending Follow-ups": row.pendingFollowups,
      "PDF Link": `/commercial/quotes/enquiry/${row.enquiryId}/pdf`,
    }))
  )
  XLSX.utils.book_append_sheet(workbook, sheet, "Sent Quote History")
  return workbook
}

export function buildSalesHistoryWorkbook(
  followups: Followup[],
  sentQuotes: SentQuote[]
) {
  const workbook = XLSX.utils.book_new()
  const rows = [
    ...sentQuotes.map((row) => ({
      Type: "Quote Sent",
      Date: row.latestSentAt.toISOString(),
      ENQ: row.enquiryNumber,
      "Quote UID": "",
      "Customer UID": row.customerUid,
      Customer: row.companyName,
      Currency: row.currency,
      Channel: "PDF",
      Lines: row.totalLines,
      "Quote Items Sent": row.sentQuoteItems,
      "Next Follow-up": row.nextFollowupDue ?? "",
      "Pending Follow-ups": row.pendingFollowups,
      Notes: "",
      "PDF Link": `/commercial/quotes/enquiry/${row.enquiryId}/pdf`,
    })),
    ...followups.map((row) => ({
      Type: "Follow-up",
      Date: row.dueOn,
      ENQ: row.enquiryNumber,
      "Quote UID": row.quoteNumber ?? "",
      "Customer UID": row.customerUid,
      Customer: row.companyName,
      Currency: "",
      Channel: row.channel,
      Lines: "",
      "Quote Items Sent": "",
      "Next Follow-up": row.dueOn,
      "Pending Follow-ups": row.status === "Pending" ? 1 : 0,
      Notes: row.note,
      "PDF Link": "",
    })),
  ].sort((left, right) => right.Date.localeCompare(left.Date))
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(rows),
    "Sales History"
  )
  return workbook
}
