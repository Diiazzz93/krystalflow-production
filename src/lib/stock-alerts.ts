// Helpers for stock alert reporting and email template generation.

import type { StockItem, StockStatus } from "@/lib/stock";
import { getStockStatus } from "@/lib/stock";

export interface AlertItem extends StockItem {
  status: StockStatus;
}

/** All items that are not "in-stock", sorted worst-first. */
export function getAlertItems(items: StockItem[]): AlertItem[] {
  return items
    .map((i) => ({ ...i, status: getStockStatus(i) }))
    .filter((i) => i.status !== "in-stock")
    .sort((a, b) => {
      const order: Record<StockStatus, number> = {
        "out-of-stock": 0,
        "critical-stock": 1,
        "low-stock": 2,
        "in-stock": 3,
      };
      return order[a.status] - order[b.status];
    });
}

/** Split alerts into raw-material reorders and made-to-order finished goods.
 *  An item is considered "made to order" when its unleashedGroup is in the
 *  user-managed finished-goods set. Those items get suppressed from the
 *  warning UI and listed separately. */
export function splitAlerts(
  items: StockItem[],
  finishedGroups: string[] | Set<string>,
): { reorderAlerts: AlertItem[]; madeToOrder: AlertItem[] } {
  const set =
    finishedGroups instanceof Set
      ? finishedGroups
      : new Set(finishedGroups.map((g) => g.trim()).filter(Boolean));
  const all = getAlertItems(items);
  const reorderAlerts: AlertItem[] = [];
  const madeToOrder: AlertItem[] = [];
  for (const i of all) {
    if (i.unleashedGroup && set.has(i.unleashedGroup.trim())) madeToOrder.push(i);
    else reorderAlerts.push(i);
  }
  return { reorderAlerts, madeToOrder };
}

export function isMadeToOrder(
  item: StockItem,
  finishedGroups: string[] | Set<string>,
): boolean {
  if (!item.unleashedGroup) return false;
  const set =
    finishedGroups instanceof Set ? finishedGroups : new Set(finishedGroups);
  return set.has(item.unleashedGroup.trim());
}

export function suggestedReorder(item: StockItem): number {
  if (item.reorderQuantity && item.reorderQuantity > 0) return item.reorderQuantity;
  // Fallback: bring up to 2x reorder level
  const target = Math.max(item.reorderLevel * 2, item.reorderLevel + 1);
  return Math.max(0, target - item.availableStock);
}

export function buildWeeklyEmailHtml(
  items: StockItem[],
  opts?: { brand?: string; finishedGoodsGroups?: string[] },
) {
  const brand = opts?.brand ?? "KrystalFlow";
  const { reorderAlerts, madeToOrder } = splitAlerts(
    items,
    opts?.finishedGoodsGroups ?? [],
  );
  const out = reorderAlerts.filter((i) => i.status === "out-of-stock");
  const crit = reorderAlerts.filter((i) => i.status === "critical-stock");
  const low = reorderAlerts.filter((i) => i.status === "low-stock");

  const row = (i: AlertItem) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #1f2937">${escape(i.name)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1f2937;font-family:monospace;color:#9ca3af">${escape(i.sku)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1f2937;text-align:right">${i.availableStock.toLocaleString()} ${escape(i.unit)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1f2937;text-align:right">${suggestedReorder(i).toLocaleString()}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #1f2937;color:#9ca3af">${escape(i.supplier ?? "—")}</td>
    </tr>`;

  const section = (title: string, color: string, list: AlertItem[]) =>
    list.length
      ? `<h3 style="color:${color};margin:20px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:.05em">${title} (${list.length})</h3>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           <thead><tr style="color:#9ca3af;text-align:left">
             <th style="padding:6px 8px;border-bottom:1px solid #1f2937">Item</th>
             <th style="padding:6px 8px;border-bottom:1px solid #1f2937">SKU</th>
             <th style="padding:6px 8px;border-bottom:1px solid #1f2937;text-align:right">Available</th>
             <th style="padding:6px 8px;border-bottom:1px solid #1f2937;text-align:right">Reorder</th>
             <th style="padding:6px 8px;border-bottom:1px solid #1f2937">Supplier</th>
           </tr></thead>
           <tbody>${list.map(row).join("")}</tbody>
         </table>`
      : "";

  const madeToOrderFooter = madeToOrder.length
    ? `<p style="margin:20px 0 0;color:#9ca3af;font-size:12px">
         ${madeToOrder.length} made-to-order finished good${madeToOrder.length === 1 ? "" : "s"} excluded — produced on demand, not reordered.
       </p>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#0b0f17;color:#e5e7eb;font-family:Inter,Arial,sans-serif">
    <div style="max-width:680px;margin:0 auto;padding:24px">
      <div style="border:1px solid #1f2937;border-radius:12px;padding:24px;background:#0f172a">
        <h1 style="margin:0 0 4px;font-size:20px">${escape(brand)} — Weekly Stock Alerts</h1>
        <p style="margin:0;color:#9ca3af;font-size:13px">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>

        <div style="display:flex;gap:8px;margin:16px 0 8px;flex-wrap:wrap">
          <span style="background:#7f1d1d33;color:#fca5a5;padding:4px 10px;border-radius:999px;font-size:12px">Out of stock: ${out.length}</span>
          <span style="background:#9a340033;color:#fdba74;padding:4px 10px;border-radius:999px;font-size:12px">Critical: ${crit.length}</span>
          <span style="background:#78350f33;color:#fcd34d;padding:4px 10px;border-radius:999px;font-size:12px">Low: ${low.length}</span>
        </div>

        ${reorderAlerts.length === 0
          ? `<p style="color:#34d399;margin-top:16px">All raw materials are above their alert thresholds. No reordering needed this week.</p>`
          : `${section("Out of stock", "#fca5a5", out)}${section("Critical", "#fdba74", crit)}${section("Low stock", "#fcd34d", low)}`}

        ${madeToOrderFooter}

        <p style="margin:24px 0 0;color:#6b7280;font-size:12px">
          This is a preview of the weekly stock alert email. Email delivery is not yet enabled.
        </p>
      </div>
    </div>
  </body></html>`;
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
