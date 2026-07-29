// dashboard/dashboardCardDefinitions.js (Milestone 12F)
// A static, declarative list -- not a calculation. Each entry names a card
// and a pure `select(snapshot)` property pluck/filter into an already-built
// BusinessSnapshot; none of them computes a new number, sorts by a new
// criterion, or formats a display string. `title`/`kind`/`domain` are
// static UI metadata (the same kind of thing a component's own label prop
// would be), not business logic.
//
// `kind` distinguishes how a Dashboard Card renders, nothing more:
//   'metric' -- a single headline number
//   'list'   -- an already-sorted/already-filtered array of rows
//   'alert'  -- an already-filtered array of warning/opportunity rows
//   'summary' -- the flat kpis object, for one "Business Summary" card
//
// Every `select` reads ONLY from the BusinessSnapshot passed in -- no ERP
// access, no Business Intelligence API call, no database access, per this
// milestone's own "Dashboard Cards" rule.

export const DASHBOARD_CARD_DEFINITIONS = Object.freeze([
  { id: 'todaysSales', title: "Today's Sales", domain: 'sales', kind: 'metric', select: (s) => s.sales.summary.totalNetSales },
  { id: 'todaysPurchases', title: "Today's Purchases", domain: 'purchase', kind: 'metric', select: (s) => s.purchase.summary.totalPurchaseValue },
  { id: 'inventoryValue', title: 'Inventory Value', domain: 'inventory', kind: 'metric', select: (s) => s.inventory.inventoryValue.totalInventoryValue },
  { id: 'inventoryTurnover', title: 'Inventory Turnover', domain: 'inventory', kind: 'metric', select: (s) => s.inventory.stockTurnover.overallTurnoverRatio },
  { id: 'lowStock', title: 'Low Stock', domain: 'inventory', kind: 'list', select: (s) => s.inventory.lowStock },
  { id: 'deadStock', title: 'Dead Stock', domain: 'inventory', kind: 'list', select: (s) => s.inventory.deadStock },
  { id: 'fastMoving', title: 'Fast Moving', domain: 'inventory', kind: 'list', select: (s) => s.inventory.fastMoving },
  { id: 'slowMoving', title: 'Slow Moving', domain: 'inventory', kind: 'list', select: (s) => s.inventory.slowMoving },
  { id: 'topSelling', title: 'Top Selling', domain: 'sales', kind: 'list', select: (s) => s.sales.topSellingItems },
  { id: 'topCategories', title: 'Top Categories', domain: 'sales', kind: 'list', select: (s) => s.sales.categoryPerformance },
  { id: 'topSuppliers', title: 'Top Suppliers', domain: 'supplier', kind: 'list', select: (s) => s.supplier.topSuppliers },
  { id: 'highestMargin', title: 'Highest Margin', domain: 'pricing', kind: 'list', select: (s) => s.pricing.highestMarginItems },
  { id: 'lowestMargin', title: 'Lowest Margin', domain: 'pricing', kind: 'list', select: (s) => s.pricing.lowestMarginItems },
  { id: 'purchaseAlerts', title: 'Purchase Alerts', domain: 'purchase', kind: 'alert', select: (s) => s.alerts.purchase },
  { id: 'pricingAlerts', title: 'Pricing Alerts', domain: 'pricing', kind: 'alert', select: (s) => s.alerts.pricing },
  { id: 'supplierAlerts', title: 'Supplier Alerts', domain: 'supplier', kind: 'alert', select: (s) => s.alerts.supplier },
  { id: 'businessSummary', title: 'Business Summary', domain: 'summary', kind: 'summary', select: (s) => s.kpis }
]);
