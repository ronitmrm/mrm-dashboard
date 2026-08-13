import { parseProductionFloorCode } from "@workspace/db/production-floors";

export function planningProductionFloorPayload(
  payload: Record<string, unknown>,
  requestedFloor: unknown
) {
  const productionFloorCode = parseProductionFloorCode(
    requestedFloor ?? payload.productionFloorCode
  );
  if (!productionFloorCode) return undefined;
  return { ...payload, productionFloorCode };
}
