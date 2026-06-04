import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStockStore } from "@/lib/stock-store";
import { getAlertItems, suggestedReorder } from "@/lib/stock-alerts";
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
  const alerts = useMemo(() => getAlertItems(items), [items]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Low stock report</DialogTitle>
          <DialogDescription>
            Items at or below their low, critical or out-of-stock thresholds. Suggested reorder
            quantities come from per-item alert settings.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded-md border border-border">
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
              {alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    All stock is above its alert thresholds.
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {i.sku}
                    </TableCell>
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
                    <TableCell className="text-sm text-muted-foreground">
                      {i.supplier ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("font-medium", STATUS_BADGE[i.status])}
                      >
                        {STATUS_LABEL[i.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
