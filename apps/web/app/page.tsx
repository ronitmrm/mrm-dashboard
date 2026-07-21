import { MrmplDashboard } from "@/components/mrmpl-dashboard";
import { requireCapability } from "@/lib/auth/require-capability";

export default async function Page() {
  await requireCapability("operations.dashboard.read", "/");
  return <MrmplDashboard />;
}
