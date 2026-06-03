import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle, Boxes, CheckCircle2, History, Layers, Package, Pencil, Plus, Scale, Search } from "lucide-react";
import {
  getStockStatus,
  resolveCategory,
  STOCK_CATEGORIES,
  type StockCategory,
  type StockItem,
  type StockStatus,
} from "@/lib/stock";
import { useStockStore } from "@/lib/stock-store";
import { ActiveJobsSection } from "@/components/stock/ActiveJobsSection";
import { AddStockDialog } from "@/components/stock/AddStockDialog";
import { EditStockDialog } from "@/components/stock/EditStockDialog";
import { AdjustStockDialog } from "@/components/stock/AdjustStockDialog";
import { StockHistoryDialog } from "@/components/stock/StockHistoryDialog";
import { useAuth } from "@/lib/auth";
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

const CATEGORY_BADGE: Record<StockCategory, string> = {
  "Bottles": "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30",
  "Caps": "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30",
  "Labels": "bg-pink-500/15 text-pink-600 dark:text-pink-300 border-pink-500/30",
  "Cartons": "bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/30",
  "Pallets": "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
  "Liquid / IBC": "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/30",
  "Raw Materials": "bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-500/30",
  "Finished Goods": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  "Other": "bg-muted text-muted-foreground border-border",
};

function categoryBadge(cat: StockCategory) {
  return (
    <Badge variant="outline" className={cn("font-medium", CATEGORY_BADGE[cat])}>
      {cat}
    </Badge>
  );
}

function StockPage() {
  const { items } = useStockStore();
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "manager");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null);
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | StockStatus>("all");
  const [category, setCategory] = useState<"all" | StockCategory>("all");

  const enriched = useMemo(
    () => items.map((i) => ({ ...i, status: getStockStatus(i), categoryResolved: resolveCategory(i) })),
    [items],
  );

  const filtered = useMemo(() => {
    return enriched.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (category !== "all" && i.categoryResolved !== category) return false;
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
  }, [enriched, q, status, category]);

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
          {canEdit && (
            <Button onClick={() => setAddOpen(true)} className="h-11 gap-2">
              <Plus className="size-4" />
              Add stock
            </Button>
          )}
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
                <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {STOCK_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <div className="hidden md:block rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Allocated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Last updated</TableHead>
                    {canEdit && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
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
                        <TableCell>{categoryBadge(i.categoryResolved)}</TableCell>
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

            <ul className="md:hidden space-y-2">
              {filtered.length === 0 && (
                <li className="rounded-md border border-border bg-card py-8 text-center text-muted-foreground text-sm">
                  No stock items match your filters.
                </li>
              )}
              {filtered.map((i) => (
                <li
                  key={i.id}
                  className={cn(
                    "rounded-md border border-border bg-card p-3 space-y-2",
                    i.status === "low-stock" && "bg-amber-500/5",
                    i.status === "out-of-stock" && "bg-red-500/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm leading-snug">{i.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{i.sku}</div>
                      <div className="mt-1">{categoryBadge(i.categoryResolved)}</div>
                    </div>
                    {statusBadge(i.status)}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">On hand</div>
                      <div className="tabular-nums font-medium">
                        {i.quantityOnHand.toLocaleString()}
                        <span className="text-muted-foreground"> {i.unit}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Available</div>
                      <div
                        className={cn(
                          "tabular-nums font-medium",
                          i.status === "low-stock" && "text-amber-600 dark:text-amber-400",
                          i.status === "out-of-stock" && "text-red-600 dark:text-red-400",
                        )}
                      >
                        {i.availableStock.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Allocated</div>
                      <div className="tabular-nums">
                        {i.allocatedStock.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{i.location}</span>
                    <span>{fmtDateTime(i.lastUpdated)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <ActiveJobsSection />
      </div>
      <AddStockDialog open={addOpen} onOpenChange={setAddOpen} />
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
