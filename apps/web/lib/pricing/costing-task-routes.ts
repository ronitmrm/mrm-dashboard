type ProductCostingTaskRoute = {
  enquiryItemId: string | null
  itemId: string | null
  taskId: string
  taskType: string
}

type CustomerCostingTaskRoute = {
  enquiryItemId: string | null
  quoteRevisionRequestId: string | null
  taskId: string
  taskType: string
}

export function productCostingTaskHref(task: ProductCostingTaskRoute) {
  if (task.taskType === "Product Parameter Bulk Revision") {
    return `/commercial/product-costing/revisions/${encodeURIComponent(task.taskId)}`
  }
  if (task.taskType === "ECN Product Parameter Costing") {
    return `/commercial/ecns?ecn=${encodeURIComponent(task.taskId)}#ecn-workbench`
  }
  if (task.enquiryItemId && task.itemId) {
    return `/commercial/product-costing/${encodeURIComponent(task.enquiryItemId)}?item=${encodeURIComponent(task.itemId)}`
  }
  return "/commercial/product-costing"
}

export function customerCostingTaskHref(task: CustomerCostingTaskRoute) {
  if (task.taskType === "Product Parameter Bulk Revision") {
    return `/commercial/customer-costing/revisions/${encodeURIComponent(task.taskId)}`
  }
  if (task.taskType === "Bulk Price Revision") {
    return `/commercial/customer-bulk-revision?revision=${encodeURIComponent(task.taskId)}#customer-bulk-workbench`
  }
  if (task.taskType === "ECN Price Review") {
    return `/commercial/ecns?ecn=${encodeURIComponent(task.taskId)}#ecn-workbench`
  }
  if (task.enquiryItemId) {
    const base = `/commercial/customer-costing/${encodeURIComponent(task.enquiryItemId)}`
    return task.quoteRevisionRequestId
      ? `${base}?poRevision=${encodeURIComponent(task.quoteRevisionRequestId)}`
      : base
  }
  return "/commercial/orders"
}
