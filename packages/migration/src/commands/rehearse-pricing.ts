import { runRehearsal } from "./rehearsal"
import { transformPricingSnapshot } from "../transform/pricing-snapshot"

await runRehearsal("pricing", async (context) => ({
  pricingSnapshot: await transformPricingSnapshot(context),
}))
