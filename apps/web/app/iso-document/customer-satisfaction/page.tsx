import { withCustomerSatisfaction } from "@/lib/iso-document/customer-satisfaction-server"
import { SatisfactionRegister } from "@/components/iso-document/customer-satisfaction-register"
export default async function CustomerSatisfactionPage() {
  return withCustomerSatisfaction(async ({ repository, access }) => (
    <SatisfactionRegister
      rows={await repository.list(access)}
      canManage={access.canManage}
      canReadAll={access.canReadAll || access.canManage || access.canVerify}
    />
  ))
}
