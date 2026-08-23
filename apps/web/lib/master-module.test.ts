import { describe, expect, it } from "vitest"

import {
  availableMainMasters,
  masterFormHref,
  masterModuleAccess,
  masterOpenHref,
  masterSelectionMatchesDestination,
  masterSelectionHref,
  resolveMasterSelection,
  subMastersFor,
  type MasterModuleAccess,
  withMasterSelectionContext,
} from "./master-module"

const fullAccess: MasterModuleAccess = {
  commercialCustomers: true,
  commercialPricing: true,
  commercialWebsiteProducts: true,
  hrApprovedPosts: true,
  hrCandidates: true,
  hrEmployees: true,
  hrJobTemplates: true,
  hrMasters: true,
  operations: true,
  storeMasters: true,
}

describe("master module selection", () => {
  it("requires the direct Store Masters capability", () => {
    const navigationAccess = {
      administration: false,
      commercialHrefs: [],
      hrHrefs: [],
      operations: true,
      productionTabIds: ["dataEntryTab" as const, "masterTablesTab" as const],
      store: true,
      storeHrefs: ["/store"],
    }

    expect(masterModuleAccess(navigationAccess).storeMasters).toBe(false)
    expect(
      masterModuleAccess(navigationAccess, { storeMasters: true }).storeMasters
    ).toBe(true)
  })
  it("separates unit masters from Universal masters", () => {
    const unitIds = availableMainMasters("cnc", fullAccess).map(({ id }) => id)
    const universalIds = availableMainMasters("universal", fullAccess).map(
      ({ id }) => id
    )

    expect(unitIds).toContain("route")
    expect(unitIds).not.toContain("commercial_pricing_masters")
    expect(universalIds).toContain("commercial_pricing_masters")
    expect(universalIds).not.toContain("route")
  })

  it("uses the main master as a confirmed zero-sub-master fallback", () => {
    expect(subMastersFor("route", fullAccess)).toEqual({
      fallback: true,
      options: [{ id: "route", label: "Process Route" }],
    })
  })

  it("uses configured sub-masters without creating a fallback", () => {
    const result = subMastersFor("store_masters", fullAccess)!

    expect(result.fallback).toBe(false)
    expect(result.options).toContainEqual({
      id: "CATEGORY",
      label: "Asset Category",
    })
  })

  it("opens Approved Posts as an HR sub-master with separate entry and table views", () => {
    expect(subMastersFor("hr_masters", fullAccess)).toEqual({
      fallback: false,
      options: [
        { id: "department", label: "Department" },
        { id: "designation", label: "Designation" },
        { id: "approved_posts", label: "Approved Posts" },
        { id: "combined_approved_posts", label: "Combined Approved Posts" },
        { id: "candidates", label: "Candidates" },
        { id: "employee_assignments", label: "Employee Assignment" },
        { id: "job_templates", label: "HR Job Templates" },
      ],
    })

    const selection = resolveMasterSelection(
      {
        main: "hr_masters",
        sub: "approved_posts",
        unit: "universal",
      },
      fullAccess
    )!

    expect(masterFormHref(selection)).toBe(
      "/hr?panel=approvedPostPanel&masterView=dataEntry&masterUnit=universal&masterMain=hr_masters&masterSub=approved_posts"
    )
    expect(masterFormHref(selection, "masterTables")).toBe(
      "/hr?panel=approvedPostPanel&masterView=masterTables&masterUnit=universal&masterMain=hr_masters&masterSub=approved_posts"
    )
    expect(
      masterSelectionMatchesDestination(selection, "/hr", {
        panel: "approvedPostPanel",
      })
    ).toBe(true)
  })
  it("groups Job Templates under HR and rejection definitions under Rejection", () => {
    const jobTemplates = resolveMasterSelection(
      { main: "hr_masters", sub: "job_templates", unit: "universal" },
      fullAccess
    )!
    expect(masterFormHref(jobTemplates)).toBe(
      "/hr?panel=postMasterPanel&masterView=dataEntry&masterUnit=universal&masterMain=hr_masters&masterSub=job_templates"
    )

    expect(subMastersFor("rejection", fullAccess)).toEqual({
      fallback: false,
      options: [
        { id: "rejection_type_master", label: "Rejection Type" },
        { id: "rejection_remark_master", label: "Rejection Remark" },
        { id: "rejection_reason_master", label: "Rejection Reason" },
      ],
    })
    const rejection = resolveMasterSelection(
      {
        main: "rejection",
        sub: "rejection_reason_master",
        unit: "universal",
      },
      fullAccess
    )!
    expect(masterFormHref(rejection)).toBe(
      "/?tab=dataEntryTab&floor=conventional&entry=rejection_reason_master&masterUnit=universal&masterMain=rejection&masterSub=rejection_reason_master"
    )
  })
  it("opens Employee Assignment as an HR sub-master", () => {
    const selection = resolveMasterSelection(
      {
        main: "hr_masters",
        sub: "employee_assignments",
        unit: "universal",
      },
      fullAccess
    )!

    expect(masterFormHref(selection)).toBe(
      "/hr?panel=employeeMasterPanel&masterView=dataEntry&kind=employee-assignment&masterUnit=universal&masterMain=hr_masters&masterSub=employee_assignments"
    )
    expect(masterFormHref(selection, "masterTables")).toBe(
      "/hr?panel=employeeMasterPanel&masterView=masterTables&kind=employee-assignment&masterUnit=universal&masterMain=hr_masters&masterSub=employee_assignments"
    )
    expect(
      masterSelectionMatchesDestination(selection, "/hr", {
        panel: "employeeMasterPanel",
      })
    ).toBe(true)
  })
  it("opens Combined Approved Posts as a separate HR sub-master", () => {
    const selection = resolveMasterSelection(
      {
        main: "hr_masters",
        sub: "combined_approved_posts",
        unit: "universal",
      },
      fullAccess
    )!

    expect(masterFormHref(selection)).toBe(
      "/hr?panel=combinedRolesPanel&masterView=dataEntry&masterUnit=universal&masterMain=hr_masters&masterSub=combined_approved_posts"
    )
    expect(masterFormHref(selection, "masterTables")).toBe(
      "/hr?panel=combinedRolesPanel&masterView=masterTables&masterUnit=universal&masterMain=hr_masters&masterSub=combined_approved_posts"
    )
    expect(
      masterSelectionMatchesDestination(selection, "/hr", {
        panel: "combinedRolesPanel",
      })
    ).toBe(true)
  })
  it("opens Candidate Entry and its records as HR master views", () => {
    const selection = resolveMasterSelection(
      { main: "hr_masters", sub: "candidates", unit: "universal" },
      fullAccess
    )!

    expect(masterFormHref(selection)).toBe(
      "/hr?panel=candidatesPanel&masterView=dataEntry&masterUnit=universal&masterMain=hr_masters&masterSub=candidates"
    )
    expect(masterFormHref(selection, "masterTables")).toBe(
      "/hr?panel=candidatesPanel&masterView=masterTables&masterUnit=universal&masterMain=hr_masters&masterSub=candidates"
    )
  })
  it("opens every existing Website Product dependency as a sub-master", () => {
    const result = subMastersFor("commercial_website_products", fullAccess)!

    expect(result).toEqual({
      fallback: false,
      options: [
        { id: "commercial_website_products", label: "Website Product Data" },
        { id: "materialGrade", label: "Material Grade" },
        { id: "category", label: "Design Category" },
        { id: "subcategory", label: "Design Subcategory" },
        { id: "application", label: "Website Application" },
        { id: "certification", label: "Website Certification" },
        { id: "websiteField", label: "Website Field Option" },
      ],
    })

    const productSelection = resolveMasterSelection(
      {
        main: "commercial_website_products",
        sub: "commercial_website_products",
        unit: "universal",
      },
      fullAccess
    )!
    expect(masterFormHref(productSelection)).toBe(
      "/commercial/website-products?masterView=dataEntry&masterUnit=universal&masterMain=commercial_website_products&masterSub=commercial_website_products"
    )

    const categorySelection = resolveMasterSelection(
      {
        main: "commercial_website_products",
        sub: "category",
        unit: "universal",
      },
      fullAccess
    )!
    expect(masterFormHref(categorySelection)).toBe(
      "/commercial/masters?masterView=dataEntry&kind=category&masterUnit=universal&masterMain=commercial_website_products&masterSub=category"
    )
  })

  it("rejects invalid, mismatched, and unauthorized relationships", () => {
    expect(
      resolveMasterSelection(
        { main: "route", sub: "route", unit: "universal" },
        fullAccess
      )
    ).toBeNull()
    expect(
      resolveMasterSelection(
        { main: "store_masters", sub: "NOT_REAL", unit: "universal" },
        fullAccess
      )
    ).toBeNull()
    expect(
      resolveMasterSelection(
        { main: "store_masters", sub: "CATEGORY", unit: "universal" },
        { ...fullAccess, storeMasters: false }
      )
    ).toBeNull()
  })

  it("preserves the complete context in form, tab, and back links", () => {
    const selection = resolveMasterSelection(
      {
        main: "commercial_pricing_masters",
        sub: "materialGrade",
        unit: "universal",
      },
      fullAccess
    )!

    expect(masterFormHref(selection, "masterTables")).toBe(
      "/commercial/masters?masterView=masterTables&kind=materialGrade&masterUnit=universal&masterMain=commercial_pricing_masters&masterSub=materialGrade"
    )
    expect(masterSelectionHref(selection)).toBe(
      "/masters?unit=universal&main=commercial_pricing_masters&sub=materialGrade"
    )
    expect(masterSelectionHref(selection, "masterTables")).toBe(
      "/masters?unit=universal&main=commercial_pricing_masters&sub=materialGrade&view=masterTables"
    )
    expect(masterOpenHref(selection, "masterTables")).toBe(
      "/masters/open?unit=universal&main=commercial_pricing_masters&sub=materialGrade&view=masterTables"
    )
    expect(
      withMasterSelectionContext(
        "/commercial/masters?masterView=masterTables&kind=materialGrade",
        new URLSearchParams(
          "masterUnit=universal&masterMain=commercial_pricing_masters&masterSub=materialGrade"
        )
      )
    ).toBe(
      "/commercial/masters?masterView=masterTables&kind=materialGrade&masterUnit=universal&masterMain=commercial_pricing_masters&masterSub=materialGrade"
    )
  })

  it("validates that routed forms match the selected relationship", () => {
    const selection = resolveMasterSelection(
      { main: "store_masters", sub: "CATEGORY", unit: "universal" },
      fullAccess
    )!

    expect(
      masterSelectionMatchesDestination(selection, "/", {
        entry: "store_masters",
        storeMaster: "CATEGORY",
      })
    ).toBe(true)
    expect(
      masterSelectionMatchesDestination(selection, "/", {
        entry: "store_masters",
        storeMaster: "SUPPLIER",
      })
    ).toBe(false)
  })
})
