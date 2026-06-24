import { useEffect, useMemo, useRef, useState } from "react";
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
import { AlertTriangle, Boxes, CheckCircle2, History, Layers, Package, Pencil, Plus, RefreshCw, Scale, Search } from "lucide-react";
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
import { LowStockReportDialog } from "@/components/stock/LowStockReportDialog";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { createUnleashedClient } from "@/lib/unleashed/client";
import { getSelectedProductGroups } from "@/lib/unleashed/mapping";
import { syncStockOnHand } from "@/lib/unleashed/stock-mirror";
import { useFinishedGoodsGroups } from "@/lib/finished-goods";
import { toast } from "sonner";

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
  "critical-stock": "Critical",
  "out-of-stock": "Out of stock",
};

function statusBadge(status: StockStatus) {
  const cls =
    status === "in-stock"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
      : status === "low-stock"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
        : status === "critical-stock"
          ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30"
          : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
  return (
    <Badge variant="outline" className={cn("font-medium", cls)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function madeToOrderBadge() {
  return (
    <Badge
      variant="outline"
      className="font-medium bg-muted/40 text-muted-foreground border-border"
    >
      Made to order
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
  const { items, updateItem } = useStockStore();
  const finishedGroups = useFinishedGoodsGroups();
  const finishedGroupSet = useMemo(
    () => new Set(finishedGroups.map((g) => g.trim()).filter(Boolean)),
    [finishedGroups],
  );
  const { hasRole } = useAuth();
  const canEdit = hasRole("admin", "manager");
  const autoSyncAttemptedRef = useRef(false);
  const [addOpen, setAddOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null);
  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);
  const [syncingLive, setSyncingLive] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | StockStatus | "made-to-order">("all");
  const [category, setCategory] = useState<"all" | StockCategory>("all");

  const enriched = useMemo(
    () =>
      items.map((i) => {
        const madeToOrder = !!i.unleashedGroup && finishedGroupSet.has(i.unleashedGroup.trim());
        return {
          ...i,
          status: getStockStatus(i),
          categoryResolved: resolveCategory(i),
          madeToOrder,
        };
      }),
    [items, finishedGroupSet],
  );

  const filtered = useMemo(() => {
    return enriched.filter((i) => {
      if (status === "made-to-order") {
        if (!i.madeToOrder) return false;
      } else if (status !== "all") {
        if (i.madeToOrder) return false;
        if (i.status !== status) return false;
      }
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
    // Exclude made-to-order finished goods from the "low / out" count — those
    // are produced on demand and shouldn't trigger reorder alerts.
    return {
      products: enriched.length,
      low: enriched.filter((i) => !i.madeToOrder && i.status !== "in-stock").length,
      available: enriched.reduce((s, i) => s + i.availableStock, 0),
      allocated: enriched.reduce((s, i) => s + i.allocatedStock, 0),
    };
  }, [enriched]);

  async function syncLiveStock() {
    const selectedGroups = getSelectedProductGroups();
    const imported = items.filter((item) => item.source === "Unleashed");
    if (imported.length === 0) {
      toast.error("No Unleashed stock items have been imported yet");
      return;
    }

    setSyncingLive(true);
    try {
      const importedCodes = new Set(imported.map((item) => item.sku));
      let allowedCodes = importedCodes;
      let allowedKeys = new Set(imported.map((item) => item.sku.trim().toLowerCase()));
      const groupByCode = new Map<string, string>();
      if (selectedGroups.length > 0) {
        const client = createUnleashedClient();
        const products = await client.fetchProducts(selectedGroups);
        const selectedKeys = new Set(products.map((product) => product.ProductCode.trim().toLowerCase()));
        for (const p of products) {
          const g = p.ProductGroup?.GroupName?.trim();
          if (g) groupByCode.set(p.ProductCode.trim().toLowerCase(), g);
        }
        const matchingImported = imported.filter((item) => selectedKeys.has(item.sku.trim().toLowerCase()));
        // If the saved Product Group selection does not include these imported
        // rows (common with Unleashed sub-groups), still sync the imported
        // SKUs instead of silently updating 0 rows.
        if (matchingImported.length > 0) {
          allowedCodes = new Set(matchingImported.map((item) => item.sku));
          allowedKeys = selectedKeys;
        }
      }
      const snapshot = await syncStockOnHand(undefined, allowedCodes, selectedGroups);
      const liveByCode = new Map(
        snapshot.items.map((stock) => [stock.ProductCode.trim().toLowerCase(), stock]),
      );
      let updated = 0;

      for (const item of imported) {
        const key = item.sku.trim().toLowerCase();
        if (!allowedKeys.has(key)) continue;
        const live = liveByCode.get(key);
        if (!live) continue;
        const group = groupByCode.get(key);
        await updateItem(item.id, {
          quantityOnHand: Number(live.QtyOnHand ?? 0),
          availableStock: Number(live.AvailableQty ?? live.QtyOnHand ?? 0),
          allocatedStock: Number(live.AllocatedQty ?? 0),
          reorderLevel: Number(live.MinStockAlertLevel ?? item.reorderLevel ?? 0),
          location: live.Warehouse?.WarehouseCode ?? item.location,
          ...(group ? { unleashedGroup: group } : {}),
        });
        updated++;
      }

      toast.success(`Updated live quantities for ${updated} item${updated === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sync live stock");
    } finally {
      setSyncingLive(false);
    }
  }

  useEffect(() => {
    const imported = items.filter((item) => item.source === "Unleashed");
    const needsInitialLiveSync =
      imported.length > 0 &&
      imported.every((item) => item.quantityOnHand <= 0 && item.availableStock <= 0) &&
      imported.length > 0;

    if (autoSyncAttemptedRef.current || syncingLive || !needsInitialLiveSync) return;
    autoSyncAttemptedRef.current = true;
    void syncLiveStock();
  }, [items, syncingLive]);

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
          <div className="flex gap-2">
            <Button variant="outline" onClick={syncLiveStock} disabled={syncingLive} className="h-11 gap-2">
              <RefreshCw className={cn("size-4", syncingLive && "animate-spin")} />
              {syncingLive ? "Syncing…" : "Sync live stock"}
            </Button>
            <Button variant="outline" onClick={() => setReportOpen(true)} className="h-11 gap-2">
              <AlertTriangle className="size-4" />
              Low stock report
            </Button>
            {canEdit && (
              <Button onClick={() => setAddOpen(true)} className="h-11 gap-2">
                <Plus className="size-4" />
                Add stock
              </Button>
            )}
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
                    <SelectItem value="critical-stock">Critical</SelectItem>
                    <SelectItem value="out-of-stock">Out of stock</SelectItem>
                    <SelectItem value="made-to-order">Made to order</SelectItem>
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
                      <TableCell colSpan={canEdit ? 10 : 9} className="text-center text-muted-foreground py-8">
                        No stock items match your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((i) => (
                      <TableRow
                        key={i.id}
                        className={cn(
                          !i.madeToOrder && i.status === "low-stock" && "bg-amber-500/5",
                          !i.madeToOrder && i.status === "out-of-stock" && "bg-red-500/5",
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
                            !i.madeToOrder && i.status === "low-stock" && "text-amber-600 dark:text-amber-400",
                            !i.madeToOrder && i.status === "out-of-stock" && "text-red-600 dark:text-red-400",
                          )}
                        >
                          {i.availableStock.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {i.allocatedStock.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {i.madeToOrder ? madeToOrderBadge() : statusBadge(i.status)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {i.location}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDateTime(i.lastUpdated)}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1"
                                onClick={() => setEditItem(i)}
                              >
                                <Pencil className="size-3.5" />
                                <span className="hidden lg:inline">Edit</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1"
                                onClick={() => setAdjustItem(i)}
                              >
                                <Scale className="size-3.5" />
                                <span className="hidden lg:inline">Adjust</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1"
                                onClick={() => setHistoryItem(i)}
                              >
                                <History className="size-3.5" />
                                <span className="hidden lg:inline">History</span>
                              </Button>
                            </div>
                          </TableCell>
                        )}
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
                    !i.madeToOrder && i.status === "low-stock" && "bg-amber-500/5",
                    !i.madeToOrder && i.status === "out-of-stock" && "bg-red-500/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm leading-snug">{i.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{i.sku}</div>
                      <div className="mt-1">{categoryBadge(i.categoryResolved)}</div>
                    </div>
                    {i.madeToOrder ? madeToOrderBadge() : statusBadge(i.status)}
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
                          !i.madeToOrder && i.status === "low-stock" && "text-amber-600 dark:text-amber-400",
                          !i.madeToOrder && i.status === "out-of-stock" && "text-red-600 dark:text-red-400",
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
                  {canEdit && (
                    <div className="flex gap-1 pt-1">
                      <Button size="sm" variant="outline" className="flex-1 h-8 gap-1" onClick={() => setEditItem(i)}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-8 gap-1" onClick={() => setAdjustItem(i)}>
                        <Scale className="size-3.5" /> Adjust
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-8 gap-1" onClick={() => setHistoryItem(i)}>
                        <History className="size-3.5" /> History
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <ActiveJobsSection />
      </div>
      <AddStockDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditStockDialog item={editItem} open={!!editItem} onOpenChange={(v) => !v && setEditItem(null)} />
      <AdjustStockDialog item={adjustItem} open={!!adjustItem} onOpenChange={(v) => !v && setAdjustItem(null)} />
      <StockHistoryDialog item={historyItem} open={!!historyItem} onOpenChange={(v) => !v && setHistoryItem(null)} />
      <LowStockReportDialog open={reportOpen} onOpenChange={setReportOpen} />
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
