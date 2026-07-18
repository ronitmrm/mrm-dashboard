import Link from "next/link"
import {
  ArrowRight,
  Calculator,
  Database,
  PackageSearch,
  UsersRound,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

const modules = [
  {
    description:
      "The first Pricing master now reads through a typed PostgreSQL repository.",
    href: "/commercial/customers",
    icon: UsersRound,
    label: "Customers",
    status: "Live slice",
  },
  {
    description:
      "Canonical product identity, costing inputs, and BOM-ready relationships.",
    href: "/commercial/products",
    icon: PackageSearch,
    label: "Products",
    status: "Live slice",
  },
  {
    description:
      "Audited workbook equations are ported and regression-tested in this app.",
    href: "/commercial/costing",
    icon: Calculator,
    label: "Product costing",
    status: "Formula port",
  },
]

export default function CommercialPage() {
  return (
    <>
      <section className="grid gap-2">
        <Badge className="w-fit" variant="outline">
          <Database />
          Canonical PostgreSQL module
        </Badge>
        <h2 className="font-heading text-2xl font-medium tracking-tight">
          Commercial workflows are moving into the MRMPL shell
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Each workflow replaces SQLite at a tested repository boundary while
          preserving approved Pricing behavior and source provenance.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {modules.map((module) => (
          <Card key={module.href}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <module.icon className="size-4" />
                {module.label}
              </CardTitle>
              <CardDescription>{module.description}</CardDescription>
              <CardAction>
                <Badge variant="secondary">{module.status}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href={module.href}>
                  Open module
                  <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
    </>
  )
}
