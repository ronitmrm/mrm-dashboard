import { runRehearsal } from "./rehearsal"
import { transformConvexSnapshot } from "../transform/convex-snapshot"
import { transformPricingSnapshot } from "../transform/pricing-snapshot"

await runRehearsal("convex", async (context) => ({
  convexSnapshot: await transformConvexSnapshot(context),
  pricingSnapshot: await transformPricingSnapshot(context),
}))
