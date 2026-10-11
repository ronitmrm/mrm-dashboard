import { notFound } from "next/navigation"
import { isAnalysisKind } from "@workspace/db/iso-analysis-domain"
import { AnalysisRegister } from "@/components/iso-document/analysis-register"
import { withIsoAnalysis } from "@/lib/iso-document/analysis-server"

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ kind: string }>
}) {
  const kind = (await params).kind.toUpperCase()
  if (!isAnalysisKind(kind)) notFound()
  return withIsoAnalysis(async ({ repository, access }) => {
    const [rows, owners] = await Promise.all([
      repository.list(access, kind),
      access.canManage
        ? repository.owners(access.organizationId)
        : Promise.resolve([]),
    ])
    return (
      <AnalysisRegister
        kind={kind}
        rows={rows}
        owners={owners}
        canManage={access.canManage}
        canReadAll={access.canReadAll || access.canManage || access.canVerify}
      />
    )
  })
}
