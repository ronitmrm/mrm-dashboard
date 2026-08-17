"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { formatIstDateTime } from "@/lib/date-time"

type MachineAsset = {
  assetCode: string
  assetName: string
  assignedAt: string | null
  identificationName: string
  status: string
  typeCode: string
}

type MachineAssetHistory = {
  assetCode: string
  assetName: string
  fromHolder: string | null
  identificationName: string
  movedAt: string
  movementType: string
  toHolder: string | null
  typeCode: string
}

export function MachineStoreAssets({
  machineNumber,
}: {
  machineNumber: string
}) {
  const [data, setData] = useState<{
    current: MachineAsset[]
    history: MachineAssetHistory[]
  }>({ current: [], history: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch(`/api/store/machines/${encodeURIComponent(machineNumber)}/assets`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load Store assets.")
        return response.json() as Promise<{
          current: MachineAsset[]
          history: MachineAssetHistory[]
        }>
      })
      .then((value) => {
        if (active) setData(value)
      })
      .catch(() => {
        if (active) setData({ current: [], history: [] })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [machineNumber])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assigned Store Assets</CardTitle>
        <CardDescription>
          Current physical assets and complete Store assignment history for this
          machine.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit ID / Serial ID</TableHead>
                <TableHead>Identification</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.current.map((asset) => (
                <TableRow key={asset.assetCode}>
                  <TableCell>
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/store/assets/${encodeURIComponent(asset.assetCode)}`}
                    >
                      {asset.assetCode}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      Asset Code {asset.typeCode}
                    </span>
                  </TableCell>
                  <TableCell>
                    {asset.identificationName}
                    <span className="block text-xs text-muted-foreground">
                      {asset.assetName}
                    </span>
                  </TableCell>
                  <TableCell>
                    {asset.assignedAt
                      ? formatIstDateTime(asset.assignedAt)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{asset.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!data.current.length ? (
                <TableRow>
                  <TableCell
                    className="h-20 text-center text-sm text-muted-foreground"
                    colSpan={4}
                  >
                    {loading
                      ? "Loading assigned assets…"
                      : "No Store assets currently assigned."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        {data.history.length ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Previous assignment history ({data.history.length})
            </summary>
            <div className="mt-3 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Unit ID</TableHead>
                    <TableHead>Movement</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.history.map((row, index) => (
                    <TableRow key={`${row.assetCode}-${row.movedAt}-${index}`}>
                      <TableCell>{formatIstDateTime(row.movedAt)}</TableCell>
                      <TableCell>
                        <Link
                          className="font-medium text-primary hover:underline"
                          href={`/store/assets/${encodeURIComponent(row.assetCode)}`}
                        >
                          {row.assetCode}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          Asset Code {row.typeCode} · {row.identificationName}
                        </span>
                      </TableCell>
                      <TableCell>{row.movementType}</TableCell>
                      <TableCell>{row.fromHolder || "—"}</TableCell>
                      <TableCell>{row.toHolder || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  )
}
