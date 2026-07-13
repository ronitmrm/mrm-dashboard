import { describe, expect, it } from "vitest";

import { shopFloorNoPendingActionLabel } from "./shop-floor-workflow";

describe("shop-floor workflow action labels", () => {
  it("does not label an already-started machine row as ready to start", () => {
    expect(shopFloorNoPendingActionLabel("operator_started")).toBe("Machine already started");
    expect(shopFloorNoPendingActionLabel("worker_start")).toBe("Machine already started");
  });
});