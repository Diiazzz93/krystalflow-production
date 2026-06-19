import { useMemo, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { findJobsAllocatingSku } from "@/lib/job-stock";
import { useStore } from "@/lib/store";
import { useStockStore } from "@/lib/stock-store";
import { fmtDate } from "@/lib/utils-domain";
import {
  fetchUnleashedAllocations,
  type UnleashedAllocation,
} from "@/lib/unleashed/allocations.functions";

interface Props {
  sku: string;
  itemName?: string;
  excludeJobId?: string;
}

/**
 * Small info button that pops over a list of other active jobs allocating
 * the same stock SKU. When no KrystalFlow job is using it, offer to look up
 * open Unleashed assemblies that are tying up the stock.
 */
export function StockAllocationPopover({ sku, itemName, excludeJobId }: Props) {
  const { jobs } = useStore();
  const { items } = useStockStore();

  const allocations = useMemo(
    () => findJobsAllocatingSku(jobs, sku, items, excludeJobId),
    [jobs, items, sku, excludeJobId],
  );

  const totalCommitted = allocations.reduce((sum, a) => sum + a.required, 0);

  const fetchUl = useServerFn(fetchUnleashedAllocations);
  const [ulState, setUlState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; data: UnleashedAllocation[] }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function loadUnleashed() {
    setUlState({ kind: "loading" });
    try {
      const data = await fetchUl({ data: { sku } });
      setUlState({ kind: "ready", data });
    } catch (e) {
      setUlState({ kind: "error", message: e instanceof Error ? e.message : "Failed to load" });
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center size-5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Show jobs allocating this stock"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-sm font-medium">Allocated to other jobs</div>
          <div className="text-xs text-muted-foreground">
            {itemName ? `${itemName} · ` : ""}
            {sku}
          </div>
        </div>

        {allocations.length === 0 ? (
          <div className="px-3 py-4 text-xs">
            <div className="text-center text-muted-foreground">
              No other active KrystalFlow jobs are using this stock item.
            </div>

            {ulState.kind === "idle" && (
              <div className="mt-3 text-center">
                <div className="text-muted-foreground mb-2">
                  Shortfall may be due to open assemblies in Unleashed.
                </div>
                <Button size="sm" variant="outline" onClick={loadUnleashed}>
                  Check Unleashed assemblies
                </Button>
              </div>
            )}

            {ulState.kind === "loading" && (
              <div className="mt-3 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Checking Unleashed…
              </div>
            )}

            {ulState.kind === "error" && (
              <div className="mt-3 text-center text-destructive">{ulState.message}</div>
            )}

            {ulState.kind === "ready" && <UnleashedList rows={ulState.data} />}
          </div>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {allocations.map((a) => (
                <div key={a.jobId} className="px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {a.customer ?? "Unknown customer"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {a.product ?? "—"}
                        {a.salesOrderNumber ? ` · SO ${a.salesOrderNumber}` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-medium tabular-nums">
                        {a.required.toLocaleString()}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {a.unit}
                        </span>
                      </div>
                      <Badge variant="outline" className="mt-0.5 text-[10px] font-normal">
                        {a.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {a.scheduledStart ? `Scheduled ${fmtDate(a.scheduledStart)}` : "Not scheduled"}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 border-t border-border bg-muted/30 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">
                {allocations.length} job{allocations.length === 1 ? "" : "s"} committed
              </span>
              <span className="font-medium tabular-nums">
                {totalCommitted.toLocaleString()} {allocations[0]?.unit}
              </span>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function UnleashedList({ rows }: { rows: UnleashedAllocation[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-3 text-center text-muted-foreground">
        No open Unleashed assemblies are allocating this stock.
      </div>
    );
  }
  const total = rows.reduce((s, r) => s + r.componentQuantity, 0);
  const unit = rows[0]?.unit ?? "";
  return (
    <div className="mt-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
        Open Unleashed assemblies
      </div>
      <div className="max-h-72 overflow-y-auto divide-y divide-border rounded border border-border">
        {rows.map((r, i) => (
          <div key={`${r.assemblyNumber ?? i}`} className="px-2 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {r.assemblyNumber ?? "Assembly"}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {r.productDescription ?? r.productCode ?? "—"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-medium tabular-nums">
                  {r.componentQuantity.toLocaleString()}{" "}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {r.unit}
                  </span>
                </div>
                <Badge variant="outline" className="mt-0.5 text-[10px] font-normal">
                  {r.assemblyStatus ?? "—"}
                </Badge>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {r.dueDate ? `Due ${fmtDate(r.dueDate)}` : "No due date"} ·
              {" "}building {r.assemblyQuantity.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px]">
        <span className="text-muted-foreground">
          {rows.length} assembl{rows.length === 1 ? "y" : "ies"}
        </span>
        <span className="font-medium tabular-nums">
          {total.toLocaleString()} {unit}
        </span>
      </div>
    </div>
  );
}
