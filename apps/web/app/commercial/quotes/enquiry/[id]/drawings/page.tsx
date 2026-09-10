import { redirect } from "next/navigation"

export default async function QuoteDrawingsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ revision?: string }>
}) {
  const { id } = await params
  const { revision } = await searchParams
  const query =
    revision && /^\d+$/.test(revision) ? `?revision=${revision}` : ""
  redirect(`/commercial/enquiries/${id}${query}#quotation-parts`)
}
