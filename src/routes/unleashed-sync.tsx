import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Wand2,
  RefreshCw,
  ArrowLeft,
  Search,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { createUnleashedClient } from "@/lib/unleashed/client";
import {
  CATEGORY_LABELS,
  SYNC_CATEGORIES,
} from "@/lib/unleashed/sync-service";
import type { UnleashedProduct } from "@/lib/unleashed/types";
import { useStockStore } from "@/lib/stock-store";
import type { StockCategory } from "@/lib/stock";
import {
  addKfCategory,
  addRule,
  clearProductMapping,
  deleteKfCategory,
  deleteRule,
  getKfCategories,
  getProductMappings,
  getRules,
  getSourceToggles,
  renameKfCategory,
  resolveCategory,
  setProductMapping,
  setSourceToggle,
  subscribeMapping,
  type KfCategory,
  type MappingRule,
  type RuleField,
  type RuleMatch,
} from "@/lib/unleashed/mapping";
import {
  getConnectedAt,
  getLastStockSyncAt,
  getStockSnapshot,
  subscribeStockMirror,
  syncStockOnHand,
  type StockSnapshot,
} from "@/lib/unleashed/stock-mirror";

export const Route = createFileRoute("/unleashed-sync")({
  component: UnleashedSyncPage,
});

function UnleashedSyncPage() {
  const [sources, setSources] = useState(() => getSourceToggles());
  const [categories, setCategories] = useState<KfCategory[]>(() => getKfCategories());
  const [mappings, setMappings] = useState(() => getProductMappings());
  const [rules, setRules] = useState<MappingRule[]>(() => getRules());
  const [products, setProducts] = useState<UnleashedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const stockStore = useStockStore();

  useEffect(
    () =>
      subscribeMapping(() => {
        setSources(getSourceToggles());
        setCategories(getKfCategories());
        setMappings(getProductMappings());
        setRules(getRules());
      }),
    [],
  );

  async function loadProducts() {
    setLoading(true);
    try {
      const client = createUnleashedClient();
      const all = await client.fetchProducts();
      setProducts(all);
      toast.success(`Loaded ${all.length} products from Unleashed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const mappingByCode = useMemo(() => {
    const m = new Map<string, string>();
    mappings.forEach((x) => m.set(x.productCode, x.kfCategoryId));
    return m;
  }, [mappings]);

  // Only filter by Unleashed source toggles when the API returned a LovableCategory.
  // Real Unleashed responses don't include that custom field, so by default everything shows.
  const visibleProducts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return products.filter((p) => {
      if (p.LovableCategory && !sources[p.LovableCategory]) return false;
      if (q && !p.ProductCode.toLowerCase().includes(q) && !p.ProductDescription.toLowerCase().includes(q)) {
        return false;
      }
      if (filterCat === "unmapped") {
        if (mappingByCode.has(p.ProductCode)) return false;
        const resolved = resolveCategory(p.ProductCode, p.ProductDescription);
        if (resolved.via !== "none") return false;
      } else if (filterCat !== "all") {
        const resolved = resolveCategory(p.ProductCode, p.ProductDescription).kfCategoryId;
        if (resolved !== filterCat) return false;
      }
      return true;
    });
  }, [products, sources, filter, filterCat, mappingByCode]);

  const stats = useMemo(() => {
    const enabled = products.filter((p) => !p.LovableCategory || sources[p.LovableCategory]);
    const mapped = enabled.filter((p) => mappingByCode.has(p.ProductCode)).length;
    const ruleMatched = enabled.filter(
      (p) => !mappingByCode.has(p.ProductCode) && resolveCategory(p.ProductCode, p.ProductDescription).via === "rule",
    ).length;
    return { total: enabled.length, mapped, ruleMatched, unmapped: enabled.length - mapped - ruleMatched };
  }, [products, sources, mappingByCode, rules]);

  const allVisibleSelected =
    visibleProducts.length > 0 && visibleProducts.every((p) => selected.has(p.ProductCode));

  function toggleAllVisible(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) visibleProducts.forEach((p) => next.add(p.ProductCode));
      else visibleProducts.forEach((p) => next.delete(p.ProductCode));
      return next;
    });
  }
  function toggleOne(code: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  function kfNameToStockCategory(name: string | undefined): StockCategory {
    if (!name) return "Other";
    const lower = name.toLowerCase();
    if (lower.includes("bottle")) return "Bottles";
    if (lower.includes("cap")) return "Caps";
    if (lower.includes("label")) return "Labels";
    if (lower.includes("carton")) return "Cartons";
    if (lower.includes("pallet")) return "Pallets";
    if (lower.includes("liquid") || lower.includes("ibc") || lower.includes("chemical")) return "Liquid / IBC";
    if (lower.includes("raw")) return "Raw Materials";
    if (lower.includes("finish")) return "Finished Goods";
    return "Other";
  }

  async function importSelected() {
    if (selected.size === 0) {
      toast.error("Pick at least one item to import");
      return;
    }
    setImporting(true);
    let added = 0;
    let skipped = 0;
    try {
      const existing = new Set(stockStore.items.map((i) => i.sku.toLowerCase()));
      for (const p of products) {
        if (!selected.has(p.ProductCode)) continue;
        if (existing.has(p.ProductCode.toLowerCase())) {
          skipped++;
          continue;
        }
        const resolvedId = mappingByCode.get(p.ProductCode)
          ?? resolveCategory(p.ProductCode, p.ProductDescription).kfCategoryId;
        const kfName = categories.find((c) => c.id === resolvedId)?.name;
        const category = kfNameToStockCategory(kfName);
        const result = await stockStore.addItem({
          name: p.ProductDescription || p.ProductCode,
          sku: p.ProductCode,
          category,
          quantityOnHand: 0,
          unit: p.UnitOfMeasure?.Name || "units",
          location: "",
          source: "Unleashed",
        });
        if (result) added++;
      }
      toast.success(`Imported ${added} item${added === 1 ? "" : "s"}${skipped ? ` (${skipped} already existed)` : ""}`);
      setSelected(new Set());
    } finally {
      setImporting(false);
    }
  }


  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
            >
              <ArrowLeft className="size-3" /> Settings
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">Unleashed sync &amp; mapping</h1>
            <p className="text-sm text-muted-foreground">
              Choose what to pull from Unleashed and map each item to a KrystalFlow category.
            </p>
          </div>
          <Button variant="outline" onClick={loadProducts} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Reload from Unleashed
          </Button>
        </div>

        {/* Sources */}
        <Card>
          <CardHeader>
            <CardTitle>1. What to sync from Unleashed</CardTitle>
            <CardDescription>
              Only enabled item types will be pulled and shown for mapping below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SYNC_CATEGORIES.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-accent/40 cursor-pointer"
                >
                  <Checkbox
                    checked={sources[cat]}
                    onCheckedChange={(v) => setSourceToggle(cat, Boolean(v))}
                  />
                  <div>
                    <div className="text-sm font-medium">{CATEGORY_LABELS[cat]}</div>
                    <div className="text-xs text-muted-foreground">
                      {products.filter((p) => p.LovableCategory === cat).length} items in Unleashed
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Categories */}
        {/* Live stock mirror */}
        <StockMirrorCard />

        <CategoriesCard categories={categories} />

        {/* Rules */}
        <RulesCard categories={categories} rules={rules} />

        {/* Product mapping table */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>4. Map Unleashed products to KrystalFlow categories</CardTitle>
              <CardDescription>
                {stats.total} items · {stats.mapped} manually mapped · {stats.ruleMatched} matched by rule ·{" "}
                {stats.unmapped} unmapped
              </CardDescription>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="size-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search code or name"
                  className="pl-7 w-56"
                />
              </div>
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unmapped">Unmapped only</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {visibleProducts.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No products to display. Adjust filters or enable more sources above.
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Unleashed product</th>
                      <th className="text-left p-2 w-32">Source</th>
                      <th className="text-left p-2 w-64">KrystalFlow category</th>
                      <th className="text-left p-2 w-32">Resolved via</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((p) => (
                      <ProductRow
                        key={p.Guid}
                        product={p}
                        categories={categories}
                        manualMapping={mappingByCode.get(p.ProductCode)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function CategoriesCard({ categories }: { categories: KfCategory[] }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  function add() {
    try {
      addKfCategory(newName);
      setNewName("");
      toast.success("Category added");
    } catch {
      toast.error("Name required");
    }
  }

  function saveRename() {
    if (!editingId) return;
    renameKfCategory(editingId, editingName);
    setEditingId(null);
    toast.success("Renamed");
  }

  function remove(c: KfCategory) {
    if (!confirm(`Delete category "${c.name}"? Mappings and rules using it will be cleared.`)) return;
    deleteKfCategory(c.id);
    toast.success("Category deleted");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. KrystalFlow categories</CardTitle>
        <CardDescription>
          These are the buckets you can assign Unleashed products to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="New category name (e.g. Bottles)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <Button onClick={add}>
            <Plus className="size-4" /> Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) =>
            editingId === c.id ? (
              <div key={c.id} className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
                <Input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-7 w-40 text-sm"
                />
                <Button size="sm" variant="ghost" onClick={saveRename}>
                  <Check className="size-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <Badge
                key={c.id}
                variant="secondary"
                className="text-sm py-1.5 px-3 gap-2 group"
              >
                {c.name}
                <button
                  onClick={() => {
                    setEditingId(c.id);
                    setEditingName(c.name);
                  }}
                  className="opacity-50 hover:opacity-100"
                  aria-label="Rename"
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  onClick={() => remove(c)}
                  className="opacity-50 hover:opacity-100 hover:text-red-400"
                  aria-label="Delete"
                >
                  <Trash2 className="size-3" />
                </button>
              </Badge>
            ),
          )}
          {categories.length === 0 && (
            <div className="text-sm text-muted-foreground">No categories yet — add one above.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RulesCard({ categories, rules }: { categories: KfCategory[]; rules: MappingRule[] }) {
  const [field, setField] = useState<RuleField>("code");
  const [match, setMatch] = useState<RuleMatch>("contains");
  const [pattern, setPattern] = useState("");
  const [kfCategoryId, setKfCategoryId] = useState<string>("");

  function add() {
    if (!pattern.trim()) {
      toast.error("Pattern required");
      return;
    }
    if (!kfCategoryId) {
      toast.error("Pick a category");
      return;
    }
    addRule({ field, match, pattern: pattern.trim(), kfCategoryId });
    setPattern("");
    toast.success("Rule added");
  }

  function nameOf(id: string) {
    return categories.find((c) => c.id === id)?.name ?? "Unknown";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="size-4" /> 3. Auto-mapping rules (optional)
        </CardTitle>
        <CardDescription>
          Rules apply when an item has no manual mapping. Manual mappings always win.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_1fr_auto] items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">If the</Label>
            <Select value={field} onValueChange={(v) => setField(v as RuleField)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="code">Product code</SelectItem>
                <SelectItem value="name">Product name</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Match</Label>
            <Select value={match} onValueChange={(v) => setMatch(v as RuleMatch)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">contains</SelectItem>
                <SelectItem value="startsWith">starts with</SelectItem>
                <SelectItem value="endsWith">ends with</SelectItem>
                <SelectItem value="equals">equals</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pattern</Label>
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="e.g. bottle"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Then assign</Label>
            <Select value={kfCategoryId} onValueChange={setKfCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add}>
            <Plus className="size-4" /> Add rule
          </Button>
        </div>

        {rules.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No rules yet. Add one above to auto-categorise matching items.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {rules.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
              >
                <div className="truncate">
                  If <span className="font-medium">{r.field === "code" ? "code" : "name"}</span>{" "}
                  <span className="text-muted-foreground">{r.match}</span>{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">{r.pattern}</code> → assign{" "}
                  <Badge variant="secondary">{nameOf(r.kfCategoryId)}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    deleteRule(r.id);
                    toast.success("Rule deleted");
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ProductRow({
  product,
  categories,
  manualMapping,
}: {
  product: UnleashedProduct;
  categories: KfCategory[];
  manualMapping: string | undefined;
}) {
  const resolved = resolveCategory(product.ProductCode, product.ProductDescription);
  const effective = manualMapping ?? resolved.kfCategoryId;

  return (
    <tr className="border-t border-border hover:bg-accent/30">
      <td className="p-2">
        <div className="font-medium text-sm">{product.ProductCode}</div>
        <div className="text-xs text-muted-foreground truncate max-w-[28rem]">
          {product.ProductDescription}
        </div>
      </td>
      <td className="p-2">
        <Badge variant="outline">{CATEGORY_LABELS[product.LovableCategory]}</Badge>
      </td>
      <td className="p-2">
        <Select
          value={effective || "__none"}
          onValueChange={(v) => {
            if (v === "__none") {
              clearProductMapping(product.ProductCode);
            } else {
              setProductMapping(product.ProductCode, v);
            }
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Choose category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— Not mapped —</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        {manualMapping ? (
          <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
            Manual
          </Badge>
        ) : resolved.via === "rule" ? (
          <Badge variant="secondary" className="bg-blue-500/15 text-blue-400 border-blue-500/30">
            Rule
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            None
          </Badge>
        )}
      </td>
      <td className="p-2">
        {manualMapping && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearProductMapping(product.ProductCode)}
            aria-label="Clear mapping"
          >
            <X className="size-3" />
          </Button>
        )}
      </td>
    </tr>
  );
}

// ---------- Live stock mirror ---------------------------------------------

function formatTime(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function StockMirrorCard() {
  const [snapshot, setSnapshot] = useState<StockSnapshot | null>(() => getStockSnapshot());
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => getLastStockSyncAt());
  const [connectedAt, setConnectedAt] = useState<string | null>(() => getConnectedAt());
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(
    () =>
      subscribeStockMirror(() => {
        setSnapshot(getStockSnapshot());
        setLastSyncAt(getLastStockSyncAt());
        setConnectedAt(getConnectedAt());
      }),
    [],
  );

  async function runSync() {
    setBusy(true);
    try {
      await syncStockOnHand();
      toast.success("Stock mirror updated from Unleashed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stock sync failed");
    } finally {
      setBusy(false);
    }
  }

  const items = snapshot?.items ?? [];
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.ProductCode.toLowerCase().includes(q) ||
        i.ProductDescription.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle>2. Live stock mirror (from Unleashed)</CardTitle>
          <CardDescription>
            Unleashed is the source of truth for stock. This is a read-only snapshot —
            when you receive stock, enter it in Unleashed and re-sync here.
          </CardDescription>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">
              Connected since: {connectedAt ? formatTime(connectedAt) : "Not yet connected"}
            </Badge>
            <Badge variant="outline">Last stock sync: {formatTime(lastSyncAt)}</Badge>
            <Badge variant="outline">{items.length} items mirrored</Badge>
          </div>
        </div>
        <Button onClick={runSync} disabled={busy}>
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Syncing…" : "Sync stock now"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No stock snapshot yet. Click <span className="font-medium">Sync stock now</span> to pull
            current quantities from Unleashed.
          </div>
        ) : (
          <>
            <div className="relative max-w-sm">
              <Search className="size-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stock code or name"
                className="pl-7"
              />
            </div>
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Product</th>
                    <th className="text-left p-2 w-28">Warehouse</th>
                    <th className="text-right p-2 w-24">On hand</th>
                    <th className="text-right p-2 w-24">Available</th>
                    <th className="text-right p-2 w-24">Allocated</th>
                    <th className="text-right p-2 w-24">Reorder ≤</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, 200).map((s) => {
                    const low = s.AvailableQty <= s.MinStockAlertLevel;
                    return (
                      <tr key={`${s.ProductCode}-${s.Warehouse.WarehouseCode}`} className="border-t border-border">
                        <td className="p-2">
                          <div className="font-medium">{s.ProductCode}</div>
                          <div className="text-xs text-muted-foreground">{s.ProductDescription}</div>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {s.Warehouse.WarehouseCode}
                        </td>
                        <td className={`p-2 text-right tabular-nums ${low ? "text-amber-400 font-medium" : ""}`}>
                          {s.QtyOnHand}
                        </td>
                        <td className="p-2 text-right tabular-nums">{s.AvailableQty}</td>
                        <td className="p-2 text-right tabular-nums">{s.AllocatedQty}</td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">
                          {s.MinStockAlertLevel}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visible.length > 200 && (
                <div className="p-2 text-xs text-muted-foreground text-center border-t border-border">
                  Showing first 200 of {visible.length} matches — refine your search.
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
