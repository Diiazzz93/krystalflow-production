import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { StockItem } from "@/lib/stock";
import {
  useStockStore,
  type AdjustmentType,
  type StockAdjustment,
} from "@/lib/stock-store";
import { cn } from "@/lib/utils";

interface Props {
  item: StockItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const TYPE_LABEL: Record<AdjustmentType, string> = {
  received: "Received",
  damaged: "Damaged",
  correction: "Correction",
  stocktake: "Stocktake",
};

const TYPE_CLASS: Record<AdjustmentType, string> = {
  received: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  damaged: "bg-red-500/15 text-red-500 border-red-500/30",
  correction: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  stocktake: "bg-blue-500/15 text-blue-500 border-blue-500/30",
};

export function StockHistoryDialog({ item, open, onOpenChange }: Props) {
  const { listAdjustments } = useStockStore();
  const [rows, setRows] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && item) {
      setLoading(true);
      listAdjustments(item.id).then((r) => {
        setRows(r);
        setLoading(false);
      });
    }
  }, [open, item, listAdjustments]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adjustment history</DialogTitle>
          <DialogDescription>
            {item.name} ({item.sku}) — full audit trail
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Previous</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Loading history…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No adjustments recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-sm">{r.userName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", TYPE_CLASS[r.adjustmentType])}>
                        {TYPE_LABEL[r.adjustmentType]}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-medium",
                        r.quantityChange > 0 && "text-emerald-500",
                        r.quantityChange < 0 && "text-red-500",
                      )}
                    >
                      {r.quantityChange > 0 ? "+" : ""}
                      {r.quantityChange.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.previousQuantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {r.newQuantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{r.reason}</div>
                      {r.notes && (
                        <div className="text-xs text-muted-foreground">{r.notes}</div>
                      )}
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
