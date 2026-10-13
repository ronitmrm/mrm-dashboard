import type { PlanningLine } from "./order-acceptance"

const checks = [
  {
    title: "Existing jobs need more machining time",
    matches: ["does not fit the planning horizon"],
    action:
      "Review these job plans and machine availability, or choose a later machining deadline.",
  },
  {
    title: "Product masters need attention",
    matches: [
      "cycle time",
      "product route",
      "route option",
      "active machines",
      "machine families",
    ],
    action:
      "Check Part Readiness. Complete the route, cycle times and compatible machines for each product.",
  },
  {
    title: "Existing machine plans need attention",
    matches: [
      "canonical machine schedule",
      "machine assignment",
      "past completion dates",
    ],
    action:
      "Review the saved machine assignments and refresh the production plan.",
  },
  {
    title: "Remaining production needs review",
    matches: ["production or route changes"],
    action:
      "Review remaining quantities and the RM decision in Planner Actions, then refresh the production plan.",
  },
  {
    title: "Raw material dates are needed",
    matches: ["awaiting tentative RM date"],
    action:
      "Enter the expected RM-ready dates for these existing jobs, then check capacity again.",
  },
  {
    title: "Other production checks need attention",
    matches: [],
    action: "Resolve the production checks below, then check capacity again.",
  },
]

export function groupWorkloadBlockers(
  blockers: string[],
  existing: PlanningLine[]
) {
  const products = new Map(existing.map((line) => [line.id, line.part]))
  const groups = checks.map((check) => ({
    ...check,
    rows: [] as { job: string; part: string; detail: string }[],
  }))
  for (const blocker of new Set(blockers)) {
    const colon = blocker.indexOf(":")
    const candidate = colon < 0 ? "" : blocker.slice(0, colon)
    const job = candidate && !candidate.includes(" ") ? candidate : "Unit"
    const detail = job === "Unit" ? blocker : blocker.slice(colon + 1).trim()
    const group =
      groups.find((group) =>
        group.matches.some((match) => detail.toLowerCase().includes(match))
      ) ?? groups[groups.length - 1]!
    group.rows.push({ job, part: products.get(job) ?? "—", detail })
  }
  return groups.filter((group) => group.rows.length)
}
