import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJobShipments } from "@/lib/shipments";

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
  const { items, markShipped, unmarkShipped } = useJobShipments(jobId);
  const shippedSet = useMemo(() => new Map(items.map((s) => [s.palletNumber, s])), [items]);
  const shippedCount = items.length;
  const remaining = Math.max(0, totalPallets - shippedCount);

  if (!totalPallets || totalPallets <= 0) {
    return (
      <div className="rounded-lg border p-3 space-y-2">
        <div className="font-medium text-sm flex items-center gap-2">
          <Truck className="size-4" /> Shipments
        </div>
        <p className="text-xs text-muted-foreground">
          Set the number of pallets for this job above to track courier pickups.
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
          {totalPallets} shipped · <span className="font-semibold text-foreground">{remaining}</span>{" "}
          remaining
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {Array.from({ length: totalPallets }, (_, i) => i + 1).map((n) => {
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
                  Pallet {n} <span className="text-muted-foreground">/ {totalPallets}</span>
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
