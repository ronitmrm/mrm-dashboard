import { describe, expect, it } from "vitest"

import { salesTaskRows } from "./sales-task-rows"

describe("sales task rows", () => {
  it("merges every open sales activity and keeps follow-ups in the task list", () => {
    expect(
      salesTaskRows({
        clarifications: [
          {
            clarificationTaskId: "clarification-1",
            companyName: "Acme",
            customerPartCode: "P-100",
            customerUid: "C-001",
            enquiryId: "enquiry-1",
            enquiryItemId: "item-1",
            enquiryNumber: "ENQ-001",
            lineNumber: 2,
            question: "Confirm grade",
          },
        ],
        followups: [
          {
            channel: "Email",
            companyName: "Beta",
            customerUid: "C-002",
            dueOn: "2026-08-20",
            enquiryId: "enquiry-2",
            enquiryNumber: "ENQ-002",
            id: "followup-1",
            note: "Request decision",
            quoteNumber: "Q-002",
            status: "Pending",
          },
          {
            channel: "Phone",
            companyName: "Acme",
            customerUid: "C-001",
            dueOn: "2026-08-19",
            enquiryId: "enquiry-1",
            enquiryNumber: "ENQ-001",
            id: "followup-complete",
            note: "Already done",
            quoteNumber: null,
            status: "Completed",
          },
        ],
        handovers: [
          {
            companyName: "Gamma",
            conversionRate: 1,
            currency: "INR",
            customerUid: "C-003",
            enquiryId: "enquiry-3",
            enquiryNumber: "ENQ-003",
            incoterms: "EXW",
            packagingTerms: "Standard",
            paymentTerms: "Advance",
            receivedOn: "2026-08-18",
            salesHoldLines: 0,
            shipmentMode: "Road",
            totalLines: 3,
          },
        ],
        quoteReady: [
          {
            companyName: "Delta",
            currency: "USD",
            customerUid: "C-004",
            enquiryId: "enquiry-4",
            enquiryNumber: "ENQ-004",
            latestQuoteAt: new Date("2026-08-17T10:00:00.000Z"),
            notQuotedLines: 1,
            quotedLines: 4,
          },
        ],
      }).map(({ taskType, enquiryNumber, line, status }) => ({
        taskType,
        enquiryNumber,
        line,
        status,
      }))
    ).toEqual([
      {
        taskType: "Follow-Up",
        enquiryNumber: "ENQ-002",
        line: "—",
        status: "Pending",
      },
      {
        taskType: "Technical Handover",
        enquiryNumber: "ENQ-003",
        line: "—",
        status: "Ready",
      },
      {
        taskType: "Quote Ready",
        enquiryNumber: "ENQ-004",
        line: "—",
        status: "Ready",
      },
      {
        taskType: "Sales Clarification",
        enquiryNumber: "ENQ-001",
        line: "Line 2",
        status: "Open",
      },
    ])
  })
})
