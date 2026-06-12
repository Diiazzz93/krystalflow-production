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
import { CATEGORY_LABELS } from "@/lib/unleashed/sync-service";
import type { UnleashedProduct, UnleashedProductGroup } from "@/lib/unleashed/types";
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
  getSelectedProductGroups,
  renameKfCategory,
  resolveCategory,
  setProductMapping,
  setSelectedProductGroups,
  subscribeMapping,
  toggleSelectedProductGroup,
  type KfCategory,
  type MappingRule,
  type RuleField,
  type RuleMatch,
} from "@/lib/unleashed/mapping";
import {
  getConnectedAt,
  getLastStockSyncAt,
  getStockSnapshot,
  clearStockSnapshot,
  subscribeStockMirror,
  syncStockOnHand,
  type StockSnapshot,
} from "@/lib/unleashed/stock-mirror";

export const Route = createFileRoute("/unleashed-sync")({
  component: UnleashedSyncPage,
});

function UnleashedSyncPage() {
  const [categories, setCategories] = useState<KfCategory[]>(() => getKfCategories());
  const [mappings, setMappings] = useState(() => getProductMappings());
  const [rules, setRules] = useState<MappingRule[]>(() => getRules());
  const [products, setProducts] = useState<UnleashedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [syncingImported, setSyncingImported] = useState(false);
  const [productGroups, setProductGroups] = useState<UnleashedProductGroup[]>([]);
  const [selectedGroups, setSelectedGroupsState] = useState<string[]>(() =>
    getSelectedProductGroups(),
  );
  const [loadingGroups, setLoadingGroups] = useState(false);
  const stockStore = useStockStore();

  useEffect(
    () =>
      subscribeMapping(() => {
        setCategories(getKfCategories());
        setMappings(getProductMappings());
        setRules(getRules());
        setSelectedGroupsState(getSelectedProductGroups());
      }),
    [],
  );

  async function loadProductGroups() {
    setLoadingGroups(true);
    try {
      const client = createUnleashedClient();
      const groups = await client.fetchProductGroups();
      // sort by name for a stable list
      groups.sort((a, b) => a.GroupName.localeCompare(b.GroupName));
      setProductGroups(groups);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load product groups");
    } finally {
      setLoadingGroups(false);
    }
  }

  async function loadProducts() {
    if (selectedGroups.length === 0) {
      setProducts([]);
      toast.error("Pick at least one Product Group above first");
      return;
    }
    setLoading(true);
    try {
      const client = createUnleashedClient();
      const all = await client.fetchProducts(selectedGroups);
      setProducts(all);
      toast.success(
        `Loaded ${all.length} products from ${selectedGroups.length} group${selectedGroups.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  // Initial load: groups always; products only when user has groups selected.
  useEffect(() => {
    loadProductGroups();
    if (getSelectedProductGroups().length > 0) {
      loadProducts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleGroup(name: string, on: boolean) {
    toggleSelectedProductGroup(name, on);
    setSelectedGroupsState(getSelectedProductGroups());
    setProducts([]);
    setSelected(new Set());
    clearStockSnapshot();
  }
  function setAllGroups(on: boolean) {
    if (on) {
      const all = productGroups.map((g) => g.GroupName);
      setSelectedProductGroups(all);
    } else {
      setSelectedProductGroups([]);
    }
    setSelectedGroupsState(getSelectedProductGroups());
    setProducts([]);
    setSelected(new Set());
    clearStockSnapshot();
  }


  const mappingByCode = useMemo(() => {
    const m = new Map<string, string>();
    mappings.forEach((x) => m.set(x.productCode, x.kfCategoryId));
    return m;
  }, [mappings]);

  // Products list already comes back filtered to the selected groups, so we
  // only need to apply the local search/category filters here.
  const visibleProducts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return products.filter((p) => {
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
  }, [products, filter, filterCat, mappingByCode]);

  const stats = useMemo(() => {
    const mapped = products.filter((p) => mappingByCode.has(p.ProductCode)).length;
    const ruleMatched = products.filter(
      (p) => !mappingByCode.has(p.ProductCode) && resolveCategory(p.ProductCode, p.ProductDescription).via === "rule",
    ).length;
    return { total: products.length, mapped, ruleMatched, unmapped: products.length - mapped - ruleMatched };
  }, [products, mappingByCode, rules]);

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
    let updated = 0;
    let skipped = 0;
    try {
      const existing = new Map(stockStore.items.map((i) => [i.sku.toLowerCase(), i]));
      const allowedCodes = new Set(products.map((p) => p.ProductCode));
      const freshSnapshot = products.length > 0
        ? await syncStockOnHand(undefined, allowedCodes, selectedGroups)
        : getStockSnapshot();
      const liveByCode = new Map(
        (freshSnapshot?.items ?? []).map((item) => [item.ProductCode.trim().toLowerCase(), item]),
      );
      for (const p of products) {
        if (!selected.has(p.ProductCode)) continue;
        const live = liveByCode.get(p.ProductCode.trim().toLowerCase());
        const existingItem = existing.get(p.ProductCode.toLowerCase());
        if (existingItem) {
          if (live) {
            await stockStore.updateItem(existingItem.id, {
              quantityOnHand: Number(live.QtyOnHand ?? 0),
              availableStock: Number(live.AvailableQty ?? live.QtyOnHand ?? 0),
              allocatedStock: Number(live.AllocatedQty ?? 0),
              reorderLevel: Number(live.MinStockAlertLevel ?? existingItem.reorderLevel ?? 0),
              location: live.Warehouse?.WarehouseCode ?? existingItem.location,
            });
            updated++;
          } else {
            skipped++;
          }
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
          quantityOnHand: Number(live?.QtyOnHand ?? 0),
          availableStock: Number(live?.AvailableQty ?? live?.QtyOnHand ?? 0),
          allocatedStock: Number(live?.AllocatedQty ?? 0),
          reorderLevel: Number(live?.MinStockAlertLevel ?? 0),
          unit: p.UnitOfMeasure?.Name || "units",
          location: live?.Warehouse?.WarehouseCode ?? "",
          source: "Unleashed",
        });
        if (result) added++;
      }
      toast.success(
        `Imported ${added} item${added === 1 ? "" : "s"}${updated ? `, updated ${updated}` : ""}${skipped ? ` (${skipped} already existed)` : ""}`,
      );
      setSelected(new Set());
    } finally {
      setImporting(false);
    }
  }

  async function refreshImportedStock() {
    if (selectedGroups.length === 0) {
      toast.error("Pick at least one Product Group above first");
      return;
    }
    const imported = stockStore.items.filter((item) => item.source === "Unleashed");
    if (imported.length === 0) {
      toast.error("No Unleashed stock items have been imported yet");
      return;
    }

    setSyncingImported(true);
    try {
      const client = createUnleashedClient();
      const selectedProducts = await client.fetchProducts(selectedGroups);
      setProducts(selectedProducts);
      const allowedCodes = new Set(selectedProducts.map((p) => p.ProductCode));
      const snapshot = await syncStockOnHand(undefined, allowedCodes, selectedGroups);
      const allowedKeys = new Set(selectedProducts.map((p) => p.ProductCode.trim().toLowerCase()));
      const liveByCode = new Map(
        snapshot.items.map((item) => [item.ProductCode.trim().toLowerCase(), item]),
      );
      let updated = 0;

      for (const item of imported) {
        if (!allowedKeys.has(item.sku.trim().toLowerCase())) continue;
        const live = liveByCode.get(item.sku.trim().toLowerCase());
        if (!live) continue;
        await stockStore.updateItem(item.id, {
          quantityOnHand: Number(live.QtyOnHand ?? 0),
          availableStock: Number(live.AvailableQty ?? live.QtyOnHand ?? 0),
          allocatedStock: Number(live.AllocatedQty ?? 0),
          reorderLevel: Number(live.MinStockAlertLevel ?? item.reorderLevel ?? 0),
          location: live.Warehouse?.WarehouseCode ?? item.location,
        });
        updated++;
      }

      toast.success(`Updated live quantities for ${updated} imported item${updated === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update imported stock");
    } finally {
      setSyncingImported(false);
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
          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="outline" onClick={loadProducts} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Reload from Unleashed
            </Button>
            <Button onClick={refreshImportedStock} disabled={syncingImported}>
              <RefreshCw className={`size-4 ${syncingImported ? "animate-spin" : ""}`} />
              {syncingImported ? "Updating stock…" : "Update imported stock"}
            </Button>
          </div>
        </div>

        {/* Product Groups picker */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>1. Which Unleashed Product Groups should sync?</CardTitle>
              <CardDescription>
                Only products in the selected groups are pulled in. Saved automatically.
                Note: Unleashed&apos;s <code>productGroup</code> filter does not include
                sub-groups — add each sub-group separately if you need them.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAllGroups(true)} disabled={productGroups.length === 0}>
                Select all
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAllGroups(false)} disabled={selectedGroups.length === 0}>
                Clear
              </Button>
              <Button variant="outline" size="sm" onClick={loadProductGroups} disabled={loadingGroups}>
                <RefreshCw className={`size-4 ${loadingGroups ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {productGroups.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {loadingGroups ? "Loading product groups from Unleashed…" : "No product groups loaded yet."}
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-80 overflow-auto pr-1">
                  {productGroups.map((g) => {
                    const checked = selectedGroups.includes(g.GroupName);
                    return (
                      <label
                        key={g.Guid}
                        className="flex items-center gap-3 rounded-md border border-border p-3 hover:bg-accent/40 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleGroup(g.GroupName, Boolean(v))}
                        />
                        <div className="text-sm font-medium truncate">{g.GroupName}</div>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {selectedGroups.length} of {productGroups.length} groups selected
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Live stock mirror */}
        <StockMirrorCard
          selectedGroups={selectedGroups}
          onProductsLoaded={setProducts}
        />


        <CategoriesCard categories={categories} />

        {/* Rules */}
        <RulesCard categories={categories} rules={rules} />

        {/* Product mapping table */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>4. Choose products to import into KrystalFlow</CardTitle>
              <CardDescription>
                {stats.total} items · {stats.mapped} manually mapped · {stats.ruleMatched} matched by rule ·{" "}
                {stats.unmapped} unmapped · {selected.size} selected
              </CardDescription>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
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
              <Button onClick={importSelected} disabled={importing || selected.size === 0}>
                <Download className={`size-4 ${importing ? "animate-pulse" : ""}`} />
                {importing ? "Importing…" : `Import ${selected.size || ""} selected`}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {visibleProducts.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                {products.length === 0
                  ? "No products loaded. Click Reload from Unleashed above."
                  : "No products match your filters."}
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2 w-10">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={(v) => toggleAllVisible(Boolean(v))}
                          aria-label="Select all visible"
                        />
                      </th>
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
                        selected={selected.has(p.ProductCode)}
                        onToggleSelected={(on) => toggleOne(p.ProductCode, on)}
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
  selected,
  onToggleSelected,
}: {
  product: UnleashedProduct;
  categories: KfCategory[];
  manualMapping: string | undefined;
  selected: boolean;
  onToggleSelected: (on: boolean) => void;
}) {
  const resolved = resolveCategory(product.ProductCode, product.ProductDescription);
  const effective = manualMapping ?? resolved.kfCategoryId;

  return (
    <tr className="border-t border-border hover:bg-accent/30">
      <td className="p-2">
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onToggleSelected(Boolean(v))}
          aria-label={`Select ${product.ProductCode}`}
        />
      </td>
      <td className="p-2">
        <div className="font-medium text-sm">{product.ProductCode}</div>
        <div className="text-xs text-muted-foreground truncate max-w-[28rem]">
          {product.ProductDescription}
        </div>
      </td>
      <td className="p-2">
        {product.LovableCategory ? (
          <Badge variant="outline">{CATEGORY_LABELS[product.LovableCategory]}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
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

function sameGroupSelection(a: string[] | undefined, b: string[]) {
  if (!a || a.length === 0 || b.length === 0) return false;
  const normalise = (value: string) => value.trim().toLowerCase();
  const left = new Set((a ?? []).map(normalise).filter(Boolean));
  const right = new Set(b.map(normalise).filter(Boolean));
  if (left.size !== right.size) return false;
  return Array.from(left).every((group) => right.has(group));
}

function StockMirrorCard({
  selectedGroups,
  onProductsLoaded,
}: {
  selectedGroups: string[];
  onProductsLoaded: (products: UnleashedProduct[]) => void;
}) {
  const [snapshot, setSnapshot] = useState<StockSnapshot | null>(() => getStockSnapshot());
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => getLastStockSyncAt());
  const [connectedAt, setConnectedAt] = useState<string | null>(() => getConnectedAt());
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const stockStore = useStockStore();

  useEffect(
    () =>
      subscribeStockMirror(() => {
        setSnapshot(getStockSnapshot());
        setLastSyncAt(getLastStockSyncAt());
        setConnectedAt(getConnectedAt());
      }),
    [],
  );

  useEffect(() => {
    if (snapshot && !sameGroupSelection(snapshot.selectedGroups, selectedGroups)) {
      clearStockSnapshot();
      setSelected(new Set());
    }
  }, [snapshot, selectedGroups]);

  async function runSync() {
    if (selectedGroups.length === 0) {
      toast.error("Pick at least one Product Group above first");
      return;
    }
    setBusy(true);
    try {
      // 1) Fetch products in the selected groups (also feeds Section 4).
      const client = createUnleashedClient();
      const products = await client.fetchProducts(selectedGroups);
      onProductsLoaded(products);
      const allowed = new Set(products.map((p) => p.ProductCode));
      // 2) Pull stock-on-hand and filter to the allowed codes.
      const snap = await syncStockOnHand(undefined, allowed, selectedGroups);
      toast.success(
        `Mirrored ${snap.items.length} stock rows from ${products.length} products in ${selectedGroups.length} group${selectedGroups.length === 1 ? "" : "s"}`,
      );
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

  const allVisibleSelected =
    visible.length > 0 && visible.every((i) => selected.has(i.ProductCode));

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) visible.forEach((i) => next.add(i.ProductCode));
      else visible.forEach((i) => next.delete(i.ProductCode));
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
    if (lower.includes("liquid") || lower.includes("ibc") || lower.includes("chemical"))
      return "Liquid / IBC";
    if (lower.includes("raw")) return "Raw Materials";
    if (lower.includes("finish")) return "Finished Goods";
    return "Other";
  }

  async function importSelectedFromMirror() {
    if (selected.size === 0) {
      toast.error("Tick the rows you want to import first");
      return;
    }
    setImporting(true);
    let added = 0;
    let skipped = 0;
    try {
      const existing = new Map(stockStore.items.map((i) => [i.sku.toLowerCase(), i]));
      const cats = getKfCategories();
      for (const s of items) {
        if (!selected.has(s.ProductCode)) continue;
        const existingItem = existing.get(s.ProductCode.toLowerCase());
        if (existingItem) {
          await stockStore.updateItem(existingItem.id, {
            quantityOnHand: Number(s.QtyOnHand ?? 0),
            availableStock: Number(s.AvailableQty ?? s.QtyOnHand ?? 0),
            allocatedStock: Number(s.AllocatedQty ?? 0),
            reorderLevel: Number(s.MinStockAlertLevel ?? existingItem.reorderLevel ?? 0),
            location: s.Warehouse?.WarehouseCode ?? existingItem.location,
          });
          skipped++;
          continue;
        }
        const resolved = resolveCategory(s.ProductCode, s.ProductDescription);
        const kfName = cats.find((c) => c.id === resolved.kfCategoryId)?.name;
        const category = kfNameToStockCategory(kfName);
        const result = await stockStore.addItem({
          name: s.ProductDescription || s.ProductCode,
          sku: s.ProductCode,
          category,
          quantityOnHand: s.QtyOnHand ?? 0,
          availableStock: s.AvailableQty ?? s.QtyOnHand ?? 0,
          allocatedStock: s.AllocatedQty ?? 0,
          reorderLevel: s.MinStockAlertLevel ?? 0,
          unit: "units",
          location: s.Warehouse?.WarehouseCode ?? "",
          source: "Unleashed",
        });
        if (result) added++;
      }
      toast.success(
        `Imported ${added} item${added === 1 ? "" : "s"}${skipped ? ` (${skipped} already existed)` : ""}`,
      );
      setSelected(new Set());
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle>2. Live stock mirror (from Unleashed)</CardTitle>
          <CardDescription>
            Pulls stock-on-hand for products in the groups you selected above. Tick rows
            and click Import to add them to KrystalFlow with their current quantities.
          </CardDescription>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">
              Connected since: {connectedAt ? formatTime(connectedAt) : "Not yet connected"}
            </Badge>
            <Badge variant="outline">Last stock sync: {formatTime(lastSyncAt)}</Badge>
            <Badge variant="outline">{items.length} items mirrored</Badge>
            <Badge variant="outline">{selected.size} selected</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={importSelectedFromMirror}
            disabled={importing || selected.size === 0}
          >
            <Download className={`size-4 ${importing ? "animate-pulse" : ""}`} />
            {importing ? "Importing…" : `Import ${selected.size || ""} to app`}
          </Button>
          <Button onClick={runSync} disabled={busy}>
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Syncing…" : "Sync stock now"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No stock snapshot yet. Click <span className="font-medium">Sync stock now</span> to pull
            current quantities from Unleashed for the selected Product Groups.
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
                    <th className="p-2 w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={(v) => toggleAll(Boolean(v))}
                        aria-label="Select all visible"
                      />
                    </th>
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
                    const isSel = selected.has(s.ProductCode);
                    return (
                      <tr key={`${s.ProductCode}-${s.Warehouse.WarehouseCode}`} className="border-t border-border">
                        <td className="p-2">
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={(v) => toggleOne(s.ProductCode, Boolean(v))}
                            aria-label={`Select ${s.ProductCode}`}
                          />
                        </td>
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
