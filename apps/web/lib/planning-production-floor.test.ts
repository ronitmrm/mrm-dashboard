import { describe, expect, it } from "vitest";

import { planningProductionFloorPayload } from "./planning-production-floor";

describe("planningProductionFloorPayload", () => {
  it("rejects missing and invalid Production Units instead of defaulting to Conventional-01", () => {
    expect(planningProductionFloorPayload({ partNo: "M1" }, undefined)).toBeUndefined();
    expect(planningProductionFloorPayload({ productionFloorCode: "unknown" }, undefined)).toBeUndefined();
  });

  it("keeps a valid Production Unit on the planning payload", () => {
    expect(
      planningProductionFloorPayload({ partNo: "M1" }, "conventional-02")
    ).toEqual({ partNo: "M1", productionFloorCode: "conventional-02" });
  });
});
