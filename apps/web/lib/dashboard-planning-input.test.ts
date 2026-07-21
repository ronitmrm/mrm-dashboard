import { describe, expect, test } from "vitest"

import {
  normalizeInterruptedSetups,
  normalizeQueueBeforeSetups,
  normalizeQueuePlacements,
  normalizeRemainingSetups,
  planningSetupNumber,
} from "./dashboard-planning-input"

describe("dashboard planning input normalization", () => {
  test("preserves the legacy nested planning decision shape with typed setup numbers", () => {
    expect(
      normalizeInterruptedSetups([
        {
          jcNo: "JC-1",
          setupNo: "Setup 2",
          machine: "MC-1",
          finishedQty: "12",
        },
        { jcNo: "", setupNo: "1", machine: "MC-2" },
      ])
    ).toEqual([
      {
        finishedQuantity: 12,
        jobCardNumber: "JC-1",
        machineNumber: "MC-1",
        setupNumber: 2,
      },
    ])

    expect(
      normalizeQueueBeforeSetups([
        { targetSetupNo: "3", jcNo: "JC-2", setupNo: "1", machine: "MC-2" },
      ])
    ).toEqual([
      {
        jobCardNumber: "JC-2",
        machineNumber: "MC-2",
        setupNumber: 1,
        targetSetupNumber: 3,
      },
    ])
  })

  test("preserves queue placement nesting and route-change setup decisions", () => {
    expect(
      normalizeQueuePlacements([
        {
          targetJcNo: "JC-3",
          targetPartCode: "PART-3",
          targetSetupNo: "Setup 4",
          targetSourceMachine: "MC-OLD",
          targetMachine: "MC-NEW",
          queueBeforeSetups: [{ jcNo: "JC-2", setupNo: "2", machine: "MC-2" }],
        },
      ])
    ).toEqual([
      {
        queueBeforeSetups: [
          {
            jobCardNumber: "JC-2",
            machineNumber: "MC-2",
            setupNumber: 2,
          },
        ],
        targetJobCardNumber: "JC-3",
        targetMachineNumber: "MC-NEW",
        targetPartCode: "PART-3",
        targetSetupNumber: 4,
        targetSourceMachineNumber: "MC-OLD",
      },
    ])

    expect(
      normalizeRemainingSetups([
        { setupNo: "1", plan: true, quantity: "25" },
        { setupNo: "Setup 2", plan: false, quantity: 0, remark: "Skip" },
      ])
    ).toEqual([
      { plan: true, quantity: 25, setupNumber: 1 },
      { plan: false, quantity: 0, remark: "Skip", setupNumber: 2 },
    ])
  })

  test("extracts a positive setup number without inventing zero", () => {
    expect(planningSetupNumber("Setup 12")).toBe(12)
    expect(planningSetupNumber(3)).toBe(3)
    expect(planningSetupNumber("none")).toBeUndefined()
    expect(planningSetupNumber(0)).toBeUndefined()
  })
})
