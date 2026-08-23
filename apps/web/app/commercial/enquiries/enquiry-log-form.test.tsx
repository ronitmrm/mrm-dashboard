import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("./actions", () => ({ createEnquiryAction: vi.fn() }))

import { EnquiryLogForm } from "./enquiry-log-form"

describe("Enquiry Log form", () => {
  it("remains visible while explaining that no active customer is available", () => {
    const html = renderToStaticMarkup(
      createElement(EnquiryLogForm, {
        customers: [],
        organizationId: "organization-1",
        termOptions: {
          buyer: [],
          currency: [],
          incoterms: [],
          packaging_terms: [],
          payment_terms: [],
          shipment_mode: [],
        },
        today: "2026-08-23",
      })
    )

    expect(html).toContain("<form")
    expect(html).toContain('id="enquiry-customer"')
    expect(html).toContain("No Active Customers Available")
    expect(html).toContain("Add An Active Customer Before Logging An Enquiry.")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Log Enquiry<\/button>/)
  })
})
