import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, PackageCheck } from "lucide-react";
import type { Job } from "@/lib/types";
import { computeJobStockCheck, type JobRequirement, type JobStockCheck as JobStockCheckResult } from "@/lib/job-stock";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useStockStore } from "@/lib/stock-store";
import { StockAllocationPopover } from "./StockAllocationPopover";

interface Props {
  job: Job;
  className?: string;
}

const STATUS_STYLE: Record<
  JobRequirement["status"],
  { dot: string; row: string; text: string; label: string }
> = {
  ok: {
    dot: "bg-emerald-500",
    row: "",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "Enough stock",
  },
  low: {
    dot: "bg-amber-500",
    row: "bg-amber-500/5",
    text: "text-amber-600 dark:text-amber-400",
    label: "Low stock",
  },
  short: {
    dot: "bg-red-500",
    row: "bg-red-500/5",
    text: "text-red-600 dark:text-red-400",
    label: "Missing stock",
  },
};

export function JobStockCheck({ job, className }: Props) {
  const { items } = useStockStore();
  const check = useMemo<JobStockCheckResult>(
    () => computeJobStockCheck(job, items),
    [
      items,
      job.quantity,
      job.bottleSize,
      job.bottlesPerCarton,
      job.bottleSku,
      job.capSku,
      job.labelSku,
      job.cartonSku,
      job.liquidSku,
      job.sku,
      job.product,
      job.stockSource,
      job.customerSuppliedItems,
    ],
  );

  if (job.stockSource === "customer") {
    return (
      <div className={cn("rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-3", className)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PackageCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium text-sm">Customer supplied materials</span>
          </div>
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
            No stock check
          </Badge>
        </div>
        {check.requirements.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No customer-supplied items recorded yet. Add them in the job edit dialog.
          </div>
        ) : (
          <div className="rounded-md border border-border bg-background overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-3 py-2">Item</th>
                  <th className="text-right font-medium px-3 py-2">Quantity</th>
                  <th className="text-left font-medium px-3 py-2">Unit</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {check.requirements.map((r) => (
                  <tr key={r.category} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.description}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.required.toLocaleString()}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.unit}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="font-medium gap-1.5 text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Provided
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-emerald-600 dark:text-emerald-400">
          ✓ Materials supplied by customer. This job is not checked against Krystal inventory.
        </div>
      </div>
    );
  }

  if (!check.hasSelections) {
    return (
      <div className={cn("rounded-lg border border-border bg-muted/20 p-3 space-y-2", className)}>
        <div className="flex items-center gap-2">
          <PackageCheck className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">Live Stock Check</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Select stock items from the dropdowns above to check availability for this job.
        </div>
      </div>
    );
  }

  const headerTone = check.hasShort
    ? "border-red-500/40 bg-red-500/5"
    : check.hasLow
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-emerald-500/40 bg-emerald-500/5";

  const HeaderIcon = check.hasShort
    ? AlertTriangle
    : check.hasLow
      ? CircleAlert
      : CheckCircle2;
  const headerText = check.hasShort
    ? `Missing stock — ${check.shortCount} item${check.shortCount === 1 ? "" : "s"} short`
    : check.hasLow
      ? "Low stock — review before scheduling"
      : "Ready to run — all stock available";
  const headerClr = check.hasShort
    ? "text-red-600 dark:text-red-400"
    : check.hasLow
      ? "text-amber-600 dark:text-amber-400"
      : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className={cn("rounded-lg border p-3 space-y-3", headerTone, className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PackageCheck className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">Live Stock Check</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            · uses selected stock records
          </span>
        </div>
        <div className={cn("flex items-center gap-1.5 text-sm font-medium", headerClr)}>
          <HeaderIcon className="size-4" />
          {headerText}
        </div>
      </div>

      <div className="rounded-md border border-border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-medium px-3 py-2">Item</th>
              <th className="text-right font-medium px-3 py-2">Required</th>
              <th className="text-right font-medium px-3 py-2">Available</th>
              <th className="text-right font-medium px-3 py-2">Short by</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {check.requirements.map((r) => {
              const s = STATUS_STYLE[r.status];
              return (
                <tr key={r.category} className={cn("border-b border-border last:border-0", s.row)}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.stock ? `${r.stock.sku} · ${r.stock.location}` : "No matching stock item"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.required.toLocaleString()}{" "}
                    <span className="text-xs text-muted-foreground">{r.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      <span>{r.available.toLocaleString()}</span>
                      {r.stock && (r.status === "low" || r.status === "short") && (
                        <StockAllocationPopover
                          sku={r.stock.sku}
                          itemName={r.stock.name}
                          excludeJobId={job.id}
                        />
                      )}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums font-medium",
                      r.missing > 0 ? s.text : "text-muted-foreground",
                    )}
                  >
                    {r.missing > 0 ? r.missing.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={cn("font-medium gap-1.5", s.text)}
                    >
                      <span className={cn("size-1.5 rounded-full", s.dot)} />
                      {s.label}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {check.ready ? (
        <div className="text-xs text-emerald-600 dark:text-emerald-400">
          ✓ All required stock is on hand. This job is ready to schedule.
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          Resolve missing items in the Stock page (or in Unleashed once connected) before
          starting this job.
        </div>
      )}
    </div>
  );
}
