import { useMemo } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { findJobsAllocatingSku } from "@/lib/job-stock";
import { useStore } from "@/lib/store";
import { useStockStore } from "@/lib/stock-store";
import { fmtDate } from "@/lib/utils-domain";

interface Props {
  sku: string;
  itemName?: string;
  excludeJobId?: string;
}

/**
 * Small info button that pops over a list of other active jobs allocating
 * the same stock SKU — so users can see where their shortfall is tied up.
 */
export function StockAllocationPopover({ sku, itemName, excludeJobId }: Props) {
  const { jobs } = useStore();
  const { items } = useStockStore();

  const allocations = useMemo(
    () => findJobsAllocatingSku(jobs, sku, items, excludeJobId),
    [jobs, items, sku, excludeJobId],
  );

  const totalCommitted = allocations.reduce((sum, a) => sum + a.required, 0);

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
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No other active jobs are using this stock item.
            <div className="mt-1">
              Shortfall may be due to allocations in Unleashed outside KrystalFlow.
            </div>
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
