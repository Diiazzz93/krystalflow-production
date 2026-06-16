import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJobShipments } from "@/lib/shipments";
import { useStore } from "@/lib/store";

interface Props {
  jobId: string;
  totalPallets: number;
  canEdit: boolean;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function JobShipmentsBlock({ jobId, totalPallets, canEdit }: Props) {
  const { qc } = useStore();
  const { items, markShipped, unmarkShipped } = useJobShipments(jobId);

  // Ready pallets = unique pallet numbers logged through QC for this job
  const readyPallets = useMemo(() => {
    const set = new Set<number>();
    for (const q of qc) {
      if (q.jobId === jobId && q.palletNumber > 0) set.add(q.palletNumber);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [qc, jobId]);

  const shippedSet = useMemo(() => new Map(items.map((s) => [s.palletNumber, s])), [items]);
  const shippedCount = items.length;
  const readyCount = readyPallets.length;
  const remaining = Math.max(0, readyCount - shippedCount);

  if (readyCount === 0) {
    return (
      <div className="rounded-lg border p-3 space-y-2">
        <div className="font-medium text-sm flex items-center gap-2">
          <Truck className="size-4" /> Shipments
        </div>
        <p className="text-xs text-muted-foreground">
          No pallets are ready yet. Pallets appear here as they pass QC
          {totalPallets ? ` (0 of ${totalPallets} ready)` : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="font-medium text-sm flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Truck className="size-4" /> Shipments
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          <span className="font-semibold text-foreground">{shippedCount}</span> of{" "}
          {readyCount} ready shipped · <span className="font-semibold text-foreground">{remaining}</span>{" "}
          remaining{totalPallets ? ` · ${readyCount}/${totalPallets} pallets QC'd` : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {readyPallets.map((n) => {
          const s = shippedSet.get(n);
          const isShipped = !!s;
          return (
            <label
              key={n}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                isShipped
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-card hover:bg-accent/40",
                !canEdit && "cursor-not-allowed opacity-80",
              )}
            >
              <Checkbox
                checked={isShipped}
                disabled={!canEdit}
                onCheckedChange={(checked) => {
                  if (checked && !isShipped) void markShipped(n);
                  else if (!checked && isShipped) void unmarkShipped(n);
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  Pallet {n}
                  {totalPallets ? <span className="text-muted-foreground"> / {totalPallets}</span> : null}
                </div>
                {s && (
                  <div className="text-[11px] text-muted-foreground truncate">
                    Shipped {fmt(s.shippedAt)}
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
