import { runRehearsal } from "./rehearsal"
import { transformPricingFoundation } from "../transform/pricing-foundation"

await runRehearsal("foundation", async (context) => ({
  pricingFoundation: await transformPricingFoundation(context),
}))
