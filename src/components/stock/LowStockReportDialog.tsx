import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, Factory } from "lucide-react";
import { useStockStore } from "@/lib/stock-store";
import { splitAlerts, suggestedReorder, type AlertItem } from "@/lib/stock-alerts";
import { useFinishedGoodsGroups } from "@/lib/finished-goods";
import { cn } from "@/lib/utils";
import type { StockStatus } from "@/lib/stock";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STATUS_BADGE: Record<StockStatus, string> = {
  "in-stock": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "low-stock": "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  "critical-stock": "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  "out-of-stock": "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};
const STATUS_LABEL: Record<StockStatus, string> = {
  "in-stock": "In stock",
  "low-stock": "Low",
  "critical-stock": "Critical",
  "out-of-stock": "Out",
};

export function LowStockReportDialog({ open, onOpenChange }: Props) {
  const { items } = useStockStore();
  const finishedGroups = useFinishedGoodsGroups();
  const { reorderAlerts, madeToOrder } = useMemo(
    () => splitAlerts(items, finishedGroups),
    [items, finishedGroups],
  );
  const [madeOpen, setMadeOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Low stock report</DialogTitle>
          <DialogDescription>
            Raw materials and packaging at or below their alert thresholds. Made-to-order
            finished goods are listed separately at the bottom.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-3">
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead className="text-right">Reorder qty</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reorderAlerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      All raw materials are above their alert thresholds.
                    </TableCell>
                  </TableRow>
                ) : (
                  reorderAlerts.map((i) => <AlertRow key={i.id} item={i} />)
                )}
              </TableBody>
            </Table>
          </div>

          {madeToOrder.length > 0 && (
            <Collapsible open={madeOpen} onOpenChange={setMadeOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-dashed border-border bg-muted/20 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Factory className="size-4" />
                    <span>
                      <span className="font-medium text-foreground">{madeToOrder.length}</span>{" "}
                      made-to-order finished good{madeToOrder.length === 1 ? "" : "s"} — produced
                      on demand, not reordered
                    </span>
                  </span>
                  <ChevronDown
                    className={cn("size-4 transition-transform", madeOpen && "rotate-180")}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="rounded-md border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead>Location</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {madeToOrder.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{i.name}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {i.sku}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {i.unleashedGroup ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {i.availableStock.toLocaleString()}{" "}
                            <span className="text-xs text-muted-foreground">{i.unit}</span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {i.location || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AlertRow({ item: i }: { item: AlertItem }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{i.name}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{i.sku}</TableCell>
      <TableCell>{i.category ?? "—"}</TableCell>
      <TableCell className="text-right tabular-nums">
        {i.availableStock.toLocaleString()}{" "}
        <span className="text-xs text-muted-foreground">{i.unit}</span>
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {i.status === "critical-stock"
          ? (i.criticalLevel ?? 0).toLocaleString()
          : i.reorderLevel.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {suggestedReorder(i).toLocaleString()}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{i.supplier ?? "—"}</TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("font-medium", STATUS_BADGE[i.status])}>
          {STATUS_LABEL[i.status]}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
