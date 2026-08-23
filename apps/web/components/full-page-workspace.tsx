import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

export function FullPageWorkspace({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="full-page-workspace"
      className={cn(
        "-m-4 grid min-h-[calc(100svh-var(--header-height))] min-w-0 content-start gap-6 bg-card p-4 lg:-m-6 lg:p-6",
        className
      )}
      {...props}
    />
  )
}
