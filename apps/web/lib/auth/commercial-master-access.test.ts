import { describe, expect, it } from "vitest"
import type { CommercialMasterSnapshot } from "@workspace/db"

import { commercialImportCapabilities, commercialMasterFormOptions, commercialTemplateReadCapabilities, readableCommercialSnapshot } from "./commercial-master-access"

describe("commercial master access", () => {
  it("sends only the selected form's reference names to the browser", () => {
    const snapshot = {
      categories: [{ code: "INTERNAL", name: "Fittings" }],
      materialGrades: [{ name: "C3604" }],
      rodTypes: [{ name: "Solid" }],
      customers: [{ email: "private@example.test" }],
      materialRates: [{ alloyPremium: 125 }],
    }

    expect(commercialMasterFormOptions(snapshot, "rodType")).toEqual({
      categories: [], materialGrades: [], rodTypes: [],
    })
    expect(commercialMasterFormOptions(snapshot, "subcategory")).toEqual({
      categories: [{ name: "Fittings" }], materialGrades: [], rodTypes: [],
    })
    expect(commercialMasterFormOptions(snapshot, "materialRate")).toEqual({
      categories: [], materialGrades: [{ name: "C3604" }], rodTypes: [{ name: "Solid" }],
    })
  })

  it("authorizes the actual template and commercial term subtype", () => {
    expect(commercialTemplateReadCapabilities("rod-types")).toEqual(["masters.universal.rodType.read"])
    expect(commercialTemplateReadCapabilities("commercials", "payment_terms")).toEqual(["masters.universal.payment_terms.read"])
    expect(commercialTemplateReadCapabilities("website-pressure")).toEqual(["masters.universal.websiteField.read"])
    expect(() => commercialTemplateReadCapabilities("unknown")).toThrow("Unknown master template")
    expect(() => commercialTemplateReadCapabilities("commercials", "unknown")).toThrow("Unknown commercial term type")
  })

  it("limits exports to allowed masters and checks every populated import sheet", () => {
    const snapshot: CommercialMasterSnapshot = {
      applications: [], categories: [], certifications: [], customers: [],
      machineTypes: [], materialGrades: [], materialRates: [], packagingOptions: [],
      processes: [], quoteTerms: [], shippingTerms: [], subcategories: [], websiteFields: [],
      rodTypes: [{ name: "Solid" }],
      commercialTerms: [
        { active: true, name: "FOB", termType: "incoterms" },
        { active: true, name: "Net 30", termType: "payment_terms" },
      ],
    }
    const allowed = readableCommercialSnapshot(snapshot, ["masters.universal.payment_terms.read"])
    expect(allowed.rodTypes).toEqual([])
    expect(allowed.commercialTerms).toEqual([{ active: true, name: "Net 30", termType: "payment_terms" }])
    expect(snapshot.rodTypes).toEqual([{ name: "Solid" }])
    expect(commercialImportCapabilities(snapshot).sort()).toEqual([
      "masters.universal.incoterms.import",
      "masters.universal.payment_terms.import",
      "masters.universal.rodType.import",
    ])
    snapshot.customers = [{
      companyName: "Customer", country: null, customerUid: "CUST-1", email: null,
      phone: null, status: "Active", defaultBuyerName: null, defaultCurrency: null,
      defaultIncoterms: null, defaultPackagingTerms: null, defaultPaymentTerms: null,
      defaultShipmentMode: null,
    }]
    expect(commercialImportCapabilities(snapshot)).toContain("masters.universal.commercial_customers.update")
  })
})
