import type { ReactNode } from "react"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { PricingInputUpdate } from "../pricing/update/pricing-input-update"

export function BulkRevisionEntry({ children }: { children: ReactNode }) {
  return (
    <Tabs defaultValue="manual" className="gap-4">
      <TabsList aria-label="Bulk revision method">
        <TabsTrigger value="manual">Manual Revision</TabsTrigger>
        <TabsTrigger value="excel">Excel Upload</TabsTrigger>
      </TabsList>
      <TabsContent
        value="manual"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        {children}
      </TabsContent>
      <TabsContent
        value="excel"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        <PricingInputUpdate />
      </TabsContent>
    </Tabs>
  )
}
