"use client"

import { useActionState, useId, useState } from "react"

import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogFooter, DialogTrigger } from "@workspace/ui/components/dialog"
import { Field, FieldDescription, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import type { SemanticTone } from "@workspace/ui/lib/semantic-tone"

import { StandardDialogContent } from "@/components/ui/golden-patterns"
import { formatIstDateTime } from "@/lib/date-time"
import type { DeviceDescription } from "@/lib/device-description"

import { approveDeviceAction, revokeDeviceAction } from "./actions"

export type DeviceRow = DeviceDescription & {
  awaitingFirstVisit: boolean
  blockedAttempts: number
  lastBlockedAt: string | null
  code: string
  firstSeenAt: string
  id: string
  isCurrent: boolean
  lastSeenAt: string
  lastUserName: string | null
  name: string | null
  reviewedAt: string | null
  reviewedByName: string | null
  status: "pending" | "approved" | "revoked"
}

const statusPresentation = {
  approved: { label: "Approved", tone: "positive" },
  pending: { label: "Pending", tone: "warning" },
  revoked: { label: "Revoked", tone: "inactive" },
} satisfies Record<DeviceRow["status"], { label: string; tone: SemanticTone }>

export function DeviceApprovalRegister({ devices }: { devices: DeviceRow[] }) {
  return (
    <OperationalTable filterStorageKey="access-administration-devices">
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Blocked Sign-ins</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Manufacturer</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>OS</TableHead>
          <TableHead>Browser</TableHead>
          <TableHead>Last User</TableHead>
          <TableHead>First Seen</TableHead>
          <TableHead>Last Seen</TableHead>
          <TableHead>Reviewed</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {devices.map((device) => (
          <TableRow key={device.id} data-row-id={device.id}>
            <TableCell className="font-mono font-medium whitespace-nowrap">
              {device.code}
              {device.isCurrent ? (
                <span className="ml-2 font-sans text-xs text-muted-foreground">
                  (this device)
                </span>
              ) : null}
            </TableCell>
            <TableCell>
              <StatusBadge tone={statusPresentation[device.status].tone}>
                {statusPresentation[device.status].label}
              </StatusBadge>
              {device.awaitingFirstVisit ? (
                <span className="block text-xs text-muted-foreground">
                  From a recent sign-in
                </span>
              ) : null}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {device.lastBlockedAt ? (
                <>
                  <StatusBadge tone="danger">{device.blockedAttempts}</StatusBadge>
                  <span className="block text-xs text-muted-foreground">
                    Last {formatIstDateTime(device.lastBlockedAt)}
                  </span>
                </>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>{device.name ?? "—"}</TableCell>
            <TableCell>{device.manufacturer}</TableCell>
            <TableCell>{device.model}</TableCell>
            <TableCell>{device.os}</TableCell>
            <TableCell>{device.browser}</TableCell>
            <TableCell>{device.lastUserName ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap">
              {formatIstDateTime(device.firstSeenAt)}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {formatIstDateTime(device.lastSeenAt)}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {device.reviewedAt
                ? `${formatIstDateTime(device.reviewedAt)} · ${device.reviewedByName ?? "—"}`
                : "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                {device.status !== "approved" ? (
                  <DeviceApproveControl device={device} />
                ) : null}
                {device.status !== "revoked" ? (
                  <form action={revokeDeviceAction}>
                    <input name="deviceId" type="hidden" value={device.id} />
                    <Button size="sm" type="submit" variant="outline">
                      {device.status === "pending" ? "Reject" : "Revoke"}
                      <span className="sr-only"> device {device.code}</span>
                    </Button>
                  </form>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </OperationalTable>
  )
}

function DeviceApproveControl({ device }: { device: DeviceRow }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          Approve<span className="sr-only"> device {device.code}</span>
        </Button>
      </DialogTrigger>
      {open ? (
        <DeviceApproveForm device={device} onDone={() => setOpen(false)} />
      ) : null}
    </Dialog>
  )
}

function DeviceApproveForm({
  device,
  onDone,
}: {
  device: DeviceRow
  onDone: () => void
}) {
  const nameId = useId()
  const [state, action, pending] = useActionState(
    async (previous: Awaited<ReturnType<typeof approveDeviceAction>>, formData: FormData) => {
      const result = await approveDeviceAction(previous, formData)
      if (!result.error) onDone()
      return result
    },
    {}
  )
  return (
    <StandardDialogContent
      title={`Approve device ${device.code}?`}
      description={`${device.manufacturer} · ${device.model} · ${device.os} · ${device.browser}. Last used by ${device.lastUserName ?? "unknown"} on ${formatIstDateTime(device.lastSeenAt)}.`}
    >
      <form action={action} className="grid gap-4">
        <input name="deviceId" type="hidden" value={device.id} />
        <Field>
          <FieldLabel htmlFor={nameId}>Device Name</FieldLabel>
          <Input
            id={nameId}
            name="name"
            autoComplete="off"
            defaultValue={device.name ?? ""}
            maxLength={80}
            placeholder="CNC-01 floor tablet"
            disabled={pending}
          />
          <FieldDescription>
            Optional. Any staff member can sign in on an approved device.
          </FieldDescription>
        </Field>
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Approving…" : "Approve Device"}
          </Button>
        </DialogFooter>
      </form>
    </StandardDialogContent>
  )
}
