import { Button } from "@workspace/ui/components/button"
import { Clock3, Pencil, Square, TriangleAlert } from "lucide-react"

export type ProductionSessionDetailAction =
  | "end"
  | "downtime"
  | "downtimeEnd"
  | "correctClose"
  | "rejection"
  | "lateDowntime"
  | "lateRejection"

type SessionRow = Record<string, unknown>

export function ProductionSessionDetailActions({
  session,
  onAction,
}: {
  session: SessionRow
  onAction: (action: ProductionSessionDetailAction) => void
}) {
  const closed =
    String(session.status ?? "")
      .trim()
      .toLowerCase() === "closed"
  const hasOpenDowntime = session.hasOpenDowntime === true
  const hasOpenBreakdownDowntime = session.hasOpenBreakdownDowntime === true

  if (closed) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onAction("correctClose")}>
          <Pencil />
          {session.outputPending === true
            ? "Complete weight"
            : "Correct end details"}
        </Button>
        <Button variant="outline" onClick={() => onAction("lateDowntime")}>
          <Clock3 />
          Add missed downtime
        </Button>
        <Button variant="outline" onClick={() => onAction("lateRejection")}>
          <TriangleAlert />
          Add missed rejection
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={hasOpenDowntime && !hasOpenBreakdownDowntime}
          title={
            hasOpenDowntime && !hasOpenBreakdownDowntime
              ? "Close the open downtime before ending this session."
              : hasOpenBreakdownDowntime
                ? "Shift Ends will carry the open breakdown into Maintenance."
                : undefined
          }
          onClick={() => onAction("end")}
        >
          <Square />
          End session
        </Button>
        {hasOpenDowntime ? (
          hasOpenBreakdownDowntime ? null : (
            <Button
              variant="destructive"
              onClick={() => onAction("downtimeEnd")}
            >
              <Clock3 />
              Close downtime
            </Button>
          )
        ) : (
          <Button variant="outline" onClick={() => onAction("downtime")}>
            <Clock3 />
            Start downtime
          </Button>
        )}
        <Button variant="outline" onClick={() => onAction("rejection")}>
          <TriangleAlert />
          Rejection
        </Button>
      </div>
      {hasOpenDowntime ? (
        <p className="text-sm text-[var(--color-warning-text)]">
          {hasOpenBreakdownDowntime
            ? "End with Shift Ends to carry this breakdown; Maintenance completes it after repair."
            : "Close the open downtime before ending this production session."}
        </p>
      ) : null}
    </div>
  )
}
