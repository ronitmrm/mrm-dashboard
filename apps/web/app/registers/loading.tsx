import { StandardState } from "@workspace/ui/components/standard-state"

export default function RegistersLoading() {
  return (
    <StandardState
      variant="loading"
      title="Loading register"
      description="Loading published documents."
    />
  )
}
