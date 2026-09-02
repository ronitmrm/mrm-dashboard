import { describe, expect, test } from "vitest"

import {
  maintenanceManagerTransition,
  maintenanceRequestIsVisibleTo,
  maintenanceTradeTransition,
} from "./maintenance-request-domain"

describe("maintenance request approval", () => {
  test("manager classification and priority replace the requester's suggestions", () => {
    expect(
      maintenanceManagerTransition({
        action: "approve",
        category: "Electrical",
        priority: "Urgent",
        status: "Pending Approval",
      })
    ).toEqual({
      category: "Electrical",
      priority: "Urgent",
      status: "Approved",
    })
  })

  test("only pending requests can receive an approval decision", () => {
    expect(() =>
      maintenanceManagerTransition({
        action: "reject",
        category: "Plumbing",
        priority: "Regular",
        status: "In Progress",
      })
    ).toThrow("Only pending maintenance requests can be reviewed.")
  })
})

describe("maintenance trade workflow", () => {
  test("moves one approved request through work without creating subtasks", () => {
    expect(maintenanceTradeTransition("Approved", "start")).toBe("In Progress")
    expect(maintenanceTradeTransition("In Progress", "complete")).toBe(
      "Completed"
    )
  })

  test("rejects work actions for an unapproved request", () => {
    expect(() =>
      maintenanceTradeTransition("Pending Approval", "start")
    ).toThrow("Approved maintenance requests can be started.")
  })
})

describe("maintenance request visibility", () => {
  const request = {
    department: "Production",
    finalCategory: "Mechanical" as const,
    status: "Approved" as const,
  }

  test("department users track only their department", () => {
    expect(
      maintenanceRequestIsVisibleTo(request, { department: "Production" })
    ).toBe(true)
    expect(
      maintenanceRequestIsVisibleTo(request, { department: "Quality" })
    ).toBe(false)
  })

  test("trade users see only approved work classified to their trade", () => {
    expect(
      maintenanceRequestIsVisibleTo(request, { trade: "Mechanical" })
    ).toBe(true)
    expect(
      maintenanceRequestIsVisibleTo(request, { trade: "Electrical" })
    ).toBe(false)
    expect(
      maintenanceRequestIsVisibleTo(
        { ...request, status: "Pending Approval" },
        { trade: "Mechanical" }
      )
    ).toBe(false)
  })

  test("maintenance manager sees every request", () => {
    expect(maintenanceRequestIsVisibleTo(request, { manager: true })).toBe(true)
  })
})
