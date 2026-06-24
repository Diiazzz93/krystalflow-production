import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  Factory,
  PackageMinus,
  PackageX,
} from "lucide-react";
import { useStockStore } from "@/lib/stock-store";
import { splitAlerts, suggestedReorder } from "@/lib/stock-alerts";
import { useFinishedGoodsGroups } from "@/lib/finished-goods";
import { LowStockReportDialog } from "@/components/stock/LowStockReportDialog";
import { cn } from "@/lib/utils";

export function StockAlertsCard() {
  const { items } = useStockStore();
  const finishedGroups = useFinishedGoodsGroups();
  const [open, setOpen] = useState(false);
  const [madeToOrderOpen, setMadeToOrderOpen] = useState(false);
  const { reorderAlerts, madeToOrder } = useMemo(
    () => splitAlerts(items, finishedGroups),
    [items, finishedGroups],
  );

  const out = reorderAlerts.filter((i) => i.status === "out-of-stock");
  const crit = reorderAlerts.filter((i) => i.status === "critical-stock");
  const low = reorderAlerts.filter((i) => i.status === "low-stock");
  const topReorder = reorderAlerts
    .map((i) => ({ item: i, qty: suggestedReorder(i) }))
    .filter((r) => r.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 4);

  return (
    <Card className={cn(reorderAlerts.length > 0 && "border-amber-500/40 bg-amber-500/5")}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4" /> Stock alerts
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Low stock report
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <StatPill
            icon={<PackageX className="size-3.5" />}
            label="Out"
            value={out.length}
            tone="red"
          />
          <StatPill
            icon={<AlertTriangle className="size-3.5" />}
            label="Critical"
            value={crit.length}
            tone="orange"
          />
          <StatPill
            icon={<PackageMinus className="size-3.5" />}
            label="Low"
            value={low.length}
            tone="amber"
          />
        </div>

        {reorderAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All raw materials are above their alert thresholds.
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Suggested reorders
            </div>
            {topReorder.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Set reorder quantities in Settings to see suggestions here.
              </p>
            ) : (
              topReorder.map(({ item, qty }) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{item.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {item.supplier ?? "No supplier"} · {item.availableStock.toLocaleString()}{" "}
                      {item.unit}
                    </div>
                  </div>
                  <Badge variant="outline" className="tabular-nums shrink-0">
                    +{qty.toLocaleString()}
                  </Badge>
                </div>
              ))
            )}
          </div>
        )}

        {madeToOrder.length > 0 && (
          <Collapsible open={madeToOrderOpen} onOpenChange={setMadeToOrderOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border border-dashed border-border px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"
              >
                <span className="flex items-center gap-2">
                  <Factory className="size-3.5" />
                  <span>
                    <span className="font-medium text-foreground">{madeToOrder.length}</span> made-to-order
                    finished good{madeToOrder.length === 1 ? "" : "s"} — produced on demand
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    madeToOrderOpen && "rotate-180",
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-1.5">
              {madeToOrder.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border border-border/60 bg-card/50 px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm truncate">{item.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate">
                      {item.sku}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                    Made to order
                  </Badge>
                </div>
              ))}
              {madeToOrder.length > 8 && (
                <div className="text-[11px] text-muted-foreground pl-1">
                  +{madeToOrder.length - 8} more in low stock report
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
      <LowStockReportDialog open={open} onOpenChange={setOpen} />
    </Card>
  );
}

function StatPill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "red" | "orange" | "amber";
}) {
  const cls =
    tone === "red"
      ? "bg-red-500/10 text-red-600 dark:text-red-300"
      : tone === "orange"
        ? "bg-orange-500/10 text-orange-600 dark:text-orange-300"
        : "bg-amber-500/10 text-amber-600 dark:text-amber-300";
  return (
    <div className={cn("rounded-md p-2 flex items-center gap-2", cls)}>
      {icon}
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-wide opacity-80">{label}</span>
        <span className="text-base font-semibold tabular-nums">{value}</span>
      </div>
    </div>
  );
}
