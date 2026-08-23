export function isActiveEnquiryCustomer({ status }: { status: string }) {
  return status.trim().toLowerCase() === "active"
}

export function activeEnquiryCustomers<T extends { status: string }>(rows: T[]) {
  return rows.filter(isActiveEnquiryCustomer)
}
