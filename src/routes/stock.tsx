import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Boxes, CheckCircle2, Layers, Package, Search } from "lucide-react";
import { MOCK_STOCK, getStockStatus, type StockItem, type StockStatus } from "@/lib/stock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "Stock — Krystalshield" },
      {
        name: "description",
        content: "Live stock levels for production planning across the Krystalshield filling lines.",
      },
    ],
  }),
  component: StockPage,
});

const STATUS_LABEL: Record<StockStatus, string> = {
  "in-stock": "In stock",
  "low-stock": "Low stock",
  "out-of-stock": "Out of stock",
};

function statusBadge(status: StockStatus) {
  const cls =
    status === "in-stock"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
      : status === "low-stock"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
        : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
  return (
    <Badge variant="outline" className={cn("font-medium", cls)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StockPage() {
  // Mock data — swap with `useQuery(['stock'], fetchStock)` once Unleashed is wired.
  const [items] = useState<StockItem[]>(MOCK_STOCK);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | StockStatus>("all");

  const enriched = useMemo(
    () => items.map((i) => ({ ...i, status: getStockStatus(i) })),
    [items],
  );

  const filtered = useMemo(() => {
    return enriched.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (q) {
        const t = q.toLowerCase();
        if (
          !i.name.toLowerCase().includes(t) &&
          !i.sku.toLowerCase().includes(t) &&
          !i.location.toLowerCase().includes(t)
        )
          return false;
      }
      return true;
    });
  }, [enriched, q, status]);

  const totals = useMemo(() => {
    return {
      products: enriched.length,
      low: enriched.filter((i) => i.status !== "in-stock").length,
      available: enriched.reduce((s, i) => s + i.availableStock, 0),
      allocated: enriched.reduce((s, i) => s + i.allocatedStock, 0),
    };
  }, [enriched]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Inventory</p>
            <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
            <p className="text-sm text-muted-foreground">
              Live view of bottles, caps, labels and raw materials. Mock data — will sync with
              Unleashed once connected.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Total products"
            value={totals.products.toLocaleString()}
            icon={<Package className="size-4" />}
          />
          <SummaryCard
            label="Low / out of stock"
            value={totals.low.toLocaleString()}
            icon={<AlertTriangle className="size-4" />}
            tone={totals.low > 0 ? "warn" : "ok"}
          />
          <SummaryCard
            label="Available stock"
            value={totals.available.toLocaleString()}
            icon={<CheckCircle2 className="size-4" />}
          />
          <SummaryCard
            label="Allocated stock"
            value={totals.allocated.toLocaleString()}
            icon={<Layers className="size-4" />}
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Boxes className="size-4" />
                Stock items
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search SKU, product, location"
                    className="pl-8 w-64"
                  />
                </div>
                <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="in-stock">In stock</SelectItem>
                    <SelectItem value="low-stock">Low stock</SelectItem>
                    <SelectItem value="out-of-stock">Out of stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Last updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No stock items match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((i) => (
                      <TableRow
                        key={i.id}
                        className={cn(
                          i.status === "low-stock" && "bg-amber-500/5",
                          i.status === "out-of-stock" && "bg-red-500/5",
                        )}
                      >
                        <TableCell className="font-medium">{i.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {i.sku}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {i.quantityOnHand.toLocaleString()}{" "}
                          <span className="text-xs text-muted-foreground">{i.unit}</span>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums font-medium",
                            i.status === "low-stock" && "text-amber-600 dark:text-amber-400",
                            i.status === "out-of-stock" && "text-red-600 dark:text-red-400",
                          )}
                        >
                          {i.availableStock.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {i.allocatedStock.toLocaleString()}
                        </TableCell>
                        <TableCell>{statusBadge(i.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {i.location}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDateTime(i.lastUpdated)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "warn" | "ok";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <span
            className={cn(
              "text-muted-foreground",
              tone === "warn" && "text-amber-600 dark:text-amber-400",
              tone === "ok" && "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {icon}
          </span>
        </div>
        <div
          className={cn(
            "mt-2 text-2xl font-semibold tabular-nums",
            tone === "warn" && "text-amber-600 dark:text-amber-400",
          )}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
