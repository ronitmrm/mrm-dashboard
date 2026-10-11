import { InterestedPartiesRegister } from "@/components/iso-document/interested-parties-register"
import { withInterestedParties } from "@/lib/iso-document/interested-parties-server"
export default async function InterestedPartiesPage() {
  return withInterestedParties(async ({ repository, access }) => (
    <InterestedPartiesRegister
      records={await repository.list(access)}
      canManage={access.canManage}
      allRecords={access.canReadAll || access.canManage || access.canVerify}
    />
  ))
}
