import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Beaker,
  Boxes,
  CheckCircle2,
  CircleAlert,
  CircleX,
  FlaskConical,
  Package,
  Plus,
  Save,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  ALLOCATING_STATUSES,
  ASSEMBLY_STATUSES,
  calculateAssembly,
  checkStock,
  computeAllocations,
  useManufacturing,
  type AssemblyQcStatus,
  type AssemblyStatus,
  type BulkFormulaBOM,
  type BulkIngredient,
  type FinishedProductBOM,
  type ProductionAssembly,
} from "@/lib/manufacturing";
import { useCustomerSpecs } from "@/lib/customer-specs";
import { cn } from "@/lib/utils";

type MfgTab = "assemblies" | "history" | "bulk" | "finished" | "stock" | "io";
const VALID_TABS: MfgTab[] = ["assemblies", "history", "bulk", "finished", "stock", "io"];

export const Route = createFileRoute("/manufacturing")({
  validateSearch: (search: Record<string, unknown>): { tab?: MfgTab } => {
    const t = search.tab as string | undefined;
    return { tab: VALID_TABS.includes(t as MfgTab) ? (t as MfgTab) : undefined };
  },
  component: ManufacturingPage,
});

function ManufacturingPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: MfgTab = search.tab ?? "assemblies";

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <FlaskConical className="size-6 text-primary" />
            Manufacturing
          </h1>
          <p className="text-sm text-muted-foreground">
            Bulk formulas, finished product BOMs, production assemblies, and stock checks.
          </p>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => navigate({ search: { tab: v as MfgTab } })}
          className="w-full"
        >
          <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full md:w-auto h-auto">
            <TabsTrigger value="assemblies" className="gap-2 py-2">
              <Wrench className="size-4" /> Production Runs
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 py-2">
              <CheckCircle2 className="size-4" /> Batch History
            </TabsTrigger>
            <TabsTrigger value="bulk" className="gap-2 py-2">
              <Beaker className="size-4" /> Bulk BOMs
            </TabsTrigger>
            <TabsTrigger value="finished" className="gap-2 py-2">
              <Package className="size-4" /> Finished BOMs
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-2 py-2">
              <Boxes className="size-4" /> Stock Check
            </TabsTrigger>
            <TabsTrigger value="io" className="gap-2 py-2">
              <Package className="size-4" /> Import / Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assemblies" className="mt-4">
            <AssembliesTab />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <BatchHistoryTab />
          </TabsContent>
          <TabsContent value="bulk" className="mt-4">
            <BulkBOMsTab />
          </TabsContent>
          <TabsContent value="finished" className="mt-4">
            <FinishedBOMsTab />
          </TabsContent>
          <TabsContent value="stock" className="mt-4">
            <StockCheckTab />
          </TabsContent>
          <TabsContent value="io" className="mt-4">
            <ImportExportTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function BatchHistoryTab() {
  const { assemblies, finishedBOMs } = useManufacturing();
  const completed = assemblies.filter((a) => a.status === "Completed");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch History</CardTitle>
        <CardDescription>Completed production runs.</CardDescription>
      </CardHeader>
      <CardContent>
        {completed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed batches yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completed.map((a) => {
                const fin = finishedBOMs.find((f) => f.id === a.finishedProductId);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.reference}</TableCell>
                    <TableCell>{fin?.productName ?? "—"}</TableCell>
                    <TableCell>{a.customer ?? "—"}</TableCell>
                    <TableCell className="text-right">{a.unitsToProduce.toLocaleString()}</TableCell>
                    <TableCell>{a.actualEnd ? new Date(a.actualEnd).toLocaleString() : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ImportExportTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Import / Export</CardTitle>
        <CardDescription>
          Bring BOMs and production data in or out of KrystalFlow.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <p>CSV import/export for Bulk Formulas, Finished Product BOMs, and Production Runs is coming soon.</p>
        <p>This will let you sync data with Unleashed, Excel templates, and other manufacturing tools.</p>
      </CardContent>
    </Card>
  );
}

// ============= Bulk BOMs =============

function BulkBOMsTab() {
  const { bulkBOMs, upsertBulk, deleteBulk, newBulk, stock } = useManufacturing();
  const [editing, setEditing] = useState<BulkFormulaBOM | null>(null);

  function startNew() {
    setEditing(newBulk());
  }
  function save() {
    if (!editing) return;
    if (!editing.productName.trim() || !editing.formulaSku.trim()) {
      toast.error("Product name and formula SKU are required");
      return;
    }
    upsertBulk(editing);
    toast.success(`Saved ${editing.productName}`);
    setEditing(null);
  }

  if (editing) {
    return (
      <BulkEditor
        bom={editing}
        rawMaterials={stock.filter((s) => s.sku.startsWith("RAW") || s.sku.startsWith("LIQ"))}
        onChange={setEditing}
        onCancel={() => setEditing(null)}
        onSave={save}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <div className="text-sm text-muted-foreground">{bulkBOMs.length} formulas</div>
        <Button onClick={startNew}>
          <Plus className="size-4 mr-1" /> New bulk formula
        </Button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {bulkBOMs.map((b) => (
          <Card key={b.id} className="hover:border-primary/40 transition-colors">
            <CardHeader className="py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Beaker className="size-4 text-primary" />
                {b.productName}
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Badge variant="secondary">{b.formulaSku}</Badge>
                <span>Base {b.baseBatchSize} L</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-xs text-muted-foreground">
                {b.ingredients.length} ingredients
              </div>
              <ul className="text-xs space-y-0.5 max-h-24 overflow-y-auto">
                {b.ingredients.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <span className="truncate">{i.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {i.quantity}{i.unit}
                      {i.percentage != null ? ` · ${i.percentage}%` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(b)}>Edit</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm(`Delete ${b.productName}?`)) deleteBulk(b.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {bulkBOMs.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No bulk formulas yet. Create your first chemical recipe.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function BulkEditor({
  bom,
  rawMaterials,
  onChange,
  onCancel,
  onSave,
}: {
  bom: BulkFormulaBOM;
  rawMaterials: { sku: string; name: string }[];
  onChange: (b: BulkFormulaBOM) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  function patchIngredient(idx: number, patch: Partial<BulkIngredient>) {
    const next = bom.ingredients.map((i, n) => (n === idx ? { ...i, ...patch } : i));
    onChange({ ...bom, ingredients: next });
  }
  function addIngredient() {
    onChange({
      ...bom,
      ingredients: [
        ...bom.ingredients,
        {
          id: `i-${Date.now().toString(36)}`,
          rawMaterialSku: "",
          name: "",
          quantity: 0,
          unit: "L",
        },
      ],
    });
  }
  function removeIngredient(idx: number) {
    onChange({ ...bom, ingredients: bom.ingredients.filter((_, n) => n !== idx) });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk formula</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Product name">
            <Input value={bom.productName} onChange={(e) => onChange({ ...bom, productName: e.target.value })} />
          </Field>
          <Field label="Formula SKU">
            <Input value={bom.formulaSku} onChange={(e) => onChange({ ...bom, formulaSku: e.target.value })} />
          </Field>
          <Field label="Base batch size (L)">
            <Input
              type="number"
              value={bom.baseBatchSize}
              onChange={(e) => onChange({ ...bom, baseBatchSize: Number(e.target.value) || 0 })}
            />
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Ingredients</Label>
            <Button size="sm" variant="outline" onClick={addIngredient}>
              <Plus className="size-4 mr-1" /> Add ingredient
            </Button>
          </div>
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raw material</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-20">Unit</TableHead>
                  <TableHead className="w-20">%</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bom.ingredients.map((i, idx) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Select
                        value={i.rawMaterialSku || "_none"}
                        onValueChange={(v) => patchIngredient(idx, { rawMaterialSku: v === "_none" ? "" : v })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">(none)</SelectItem>
                          {rawMaterials.map((r) => (
                            <SelectItem key={r.sku} value={r.sku}>
                              {r.sku} — {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        value={i.name}
                        onChange={(e) => patchIngredient(idx, { name: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        type="number"
                        value={i.quantity}
                        onChange={(e) => patchIngredient(idx, { quantity: Number(e.target.value) || 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        value={i.unit}
                        onChange={(e) => patchIngredient(idx, { unit: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8"
                        type="number"
                        value={i.percentage ?? ""}
                        onChange={(e) =>
                          patchIngredient(idx, {
                            percentage: e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => removeIngredient(idx)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {bom.ingredients.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      No ingredients yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <Field label="Notes / instructions">
          <Textarea value={bom.notes} onChange={(e) => onChange({ ...bom, notes: e.target.value })} rows={3} />
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onSave}><Save className="size-4 mr-1" /> Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= Finished BOMs =============

function FinishedBOMsTab() {
  const { finishedBOMs, bulkBOMs, upsertFinished, deleteFinished, newFinished, stock } = useManufacturing();
  const [editing, setEditing] = useState<FinishedProductBOM | null>(null);

  function save() {
    if (!editing) return;
    if (!editing.productName.trim() || !editing.bulkFormulaId) {
      toast.error("Product name and linked bulk formula are required");
      return;
    }
    upsertFinished(editing);
    toast.success(`Saved ${editing.productName}`);
    setEditing(null);
  }

  if (editing) {
    return (
      <FinishedEditor
        bom={editing}
        bulkOptions={bulkBOMs}
        stock={stock}
        onChange={setEditing}
        onCancel={() => setEditing(null)}
        onSave={save}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <div className="text-sm text-muted-foreground">{finishedBOMs.length} finished products</div>
        <Button onClick={() => setEditing(newFinished())}>
          <Plus className="size-4 mr-1" /> New finished BOM
        </Button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {finishedBOMs.map((f) => {
          const bulk = bulkBOMs.find((b) => b.id === f.bulkFormulaId);
          return (
            <Card key={f.id} className="hover:border-primary/40 transition-colors">
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="size-4 text-primary" />
                  {f.productName}
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <Badge variant="secondary">{f.productSku}</Badge>
                  <span>{f.containerSize}{f.containerUnit}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-1">
                <div>Bulk: <span className="text-foreground">{bulk?.productName ?? "—"}</span></div>
                <div>Liquid / unit: {f.liquidPerUnit} L</div>
                <div>Pack: {f.unitsPerCarton}/ctn{f.cartonsPerPallet ? ` · ${f.cartonsPerPallet} ctn/pallet` : ""}</div>
                <div className="text-muted-foreground truncate">
                  {f.bottleSku} · {f.capSku} · {f.labelSku} · {f.cartonSku}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(f)}>Edit</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(`Delete ${f.productName}?`)) deleteFinished(f.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {finishedBOMs.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No finished BOMs yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function FinishedEditor({
  bom,
  bulkOptions,
  stock,
  onChange,
  onCancel,
  onSave,
}: {
  bom: FinishedProductBOM;
  bulkOptions: BulkFormulaBOM[];
  stock: { sku: string; name: string }[];
  onChange: (b: FinishedProductBOM) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const stockSelect = (label: string, value: string, onPick: (v: string) => void, filterPrefix?: string) => {
    const opts = filterPrefix ? stock.filter((s) => s.sku.startsWith(filterPrefix)) : stock;
    return (
      <Field label={label}>
        <Select value={value || "_none"} onValueChange={(v) => onPick(v === "_none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">(none)</SelectItem>
            {opts.map((s) => (
              <SelectItem key={s.sku} value={s.sku}>{s.sku} — {s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  };

  return (
    <Card>
      <CardHeader><CardTitle>Finished product BOM</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Product name">
            <Input value={bom.productName} onChange={(e) => onChange({ ...bom, productName: e.target.value })} />
          </Field>
          <Field label="Product SKU">
            <Input value={bom.productSku} onChange={(e) => onChange({ ...bom, productSku: e.target.value })} />
          </Field>
          <Field label="Linked bulk formula">
            <Select
              value={bom.bulkFormulaId || "_none"}
              onValueChange={(v) => onChange({ ...bom, bulkFormulaId: v === "_none" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">(none)</SelectItem>
                {bulkOptions.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.productName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Container size">
            <Input
              type="number"
              value={bom.containerSize}
              onChange={(e) => onChange({ ...bom, containerSize: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Container unit">
            <Select
              value={bom.containerUnit}
              onValueChange={(v) => onChange({ ...bom, containerUnit: v as "L" | "ml" })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="L">L</SelectItem>
                <SelectItem value="ml">ml</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Liquid required per unit (L)">
            <Input
              type="number"
              step="0.01"
              value={bom.liquidPerUnit}
              onChange={(e) => onChange({ ...bom, liquidPerUnit: Number(e.target.value) || 0 })}
            />
          </Field>
          {stockSelect("Bottle / drum", bom.bottleSku, (v) => onChange({ ...bom, bottleSku: v }))}
          {stockSelect("Cap", bom.capSku, (v) => onChange({ ...bom, capSku: v }), "CAP")}
          {stockSelect("Label", bom.labelSku, (v) => onChange({ ...bom, labelSku: v }), "LBL")}
          {stockSelect("Carton", bom.cartonSku, (v) => onChange({ ...bom, cartonSku: v }), "BOX")}
          <Field label="Units per carton">
            <Input
              type="number"
              value={bom.unitsPerCarton}
              onChange={(e) => onChange({ ...bom, unitsPerCarton: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Cartons per pallet">
            <Input
              type="number"
              value={bom.cartonsPerPallet ?? ""}
              onChange={(e) =>
                onChange({
                  ...bom,
                  cartonsPerPallet: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
        <Field label="Pallet / carton notes">
          <Textarea
            rows={3}
            value={bom.palletNotes ?? ""}
            onChange={(e) => onChange({ ...bom, palletNotes: e.target.value })}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onSave}><Save className="size-4 mr-1" /> Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============= Assemblies =============

function AssembliesTab() {
  const {
    assemblies,
    finishedBOMs,
    bulkBOMs,
    upsertAssembly,
    deleteAssembly,
    newAssembly,
    stock,
  } = useManufacturing();
  const { specs: customerSpecs } = useCustomerSpecs();
  const [editing, setEditing] = useState<ProductionAssembly | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function save() {
    if (!editing) return;
    if (!editing.finishedProductId || editing.unitsToProduce <= 0) {
      toast.error("Select a finished product and quantity greater than zero");
      return;
    }
    upsertAssembly(editing);
    toast.success(`Saved ${editing.reference}`);
    setEditing(null);
  }

  const customerOptions = useMemo(
    () => Array.from(new Set(customerSpecs.map((s) => s.customer))).sort(),
    [customerSpecs],
  );

  const previewCalc = useMemo(() => {
    if (!editing) return null;
    const fin = finishedBOMs.find((f) => f.id === editing.finishedProductId);
    const blk = fin ? bulkBOMs.find((b) => b.id === fin.bulkFormulaId) : undefined;
    return calculateAssembly(editing.unitsToProduce, fin, blk);
  }, [editing, finishedBOMs, bulkBOMs]);

  const previewAllocations = useMemo(
    () => (editing ? computeAllocations(assemblies, finishedBOMs, bulkBOMs, editing.id) : new Map()),
    [editing, assemblies, finishedBOMs, bulkBOMs],
  );

  if (editing) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Production assembly</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <Field label="Reference">
                <Input value={editing.reference} onChange={(e) => setEditing({ ...editing, reference: e.target.value })} />
              </Field>
              <Field label="Customer">
                <Select
                  value={editing.customer || "_none"}
                  onValueChange={(v) => setEditing({ ...editing, customer: v === "_none" ? undefined : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">(none)</SelectItem>
                    {customerOptions.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Finished product">
                <Select
                  value={editing.finishedProductId || "_none"}
                  onValueChange={(v) => setEditing({ ...editing, finishedProductId: v === "_none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">(none)</SelectItem>
                    {finishedBOMs.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.productName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Units to produce">
                <Input
                  type="number"
                  value={editing.unitsToProduce}
                  onChange={(e) => setEditing({ ...editing, unitsToProduce: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Scheduled for">
                <Input
                  type="datetime-local"
                  value={editing.scheduledFor ? editing.scheduledFor.slice(0, 16) : ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      scheduledFor: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                    })
                  }
                />
              </Field>
              <Field label="Status">
                <Select
                  value={editing.status}
                  onValueChange={(v) => setEditing({ ...editing, status: v as AssemblyStatus })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSEMBLY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Notes">
              <Textarea
                rows={2}
                value={editing.notes ?? ""}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={save}><Save className="size-4 mr-1" /> Save</Button>
            </div>
          </CardContent>
        </Card>

        {previewCalc && previewCalc.finished && (
          <RequirementsCard calc={previewCalc} stock={stock} allocations={previewAllocations} />
        )}
      </div>
    );
  }

  

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <div className="text-sm text-muted-foreground">{assemblies.length} assemblies</div>
        <Button onClick={() => setEditing(newAssembly())}>
          <Plus className="size-4 mr-1" /> New assembly
        </Button>
      </div>
      <div className="grid gap-3">
        {assemblies.map((a) => {
          const fin = finishedBOMs.find((f) => f.id === a.finishedProductId);
          const blk = fin ? bulkBOMs.find((b) => b.id === fin.bulkFormulaId) : undefined;
          const calc = calculateAssembly(a.unitsToProduce, fin, blk);
          // Allocations of OTHER assemblies — for this card's readiness view
          const otherAlloc = computeAllocations(assemblies, finishedBOMs, bulkBOMs, a.id);
          const readiness = checkStock(calc, stock, otherAlloc);
          const ready = readiness.every((l) => l.status === "ok");
          const expanded = expandedId === a.id;
          return (
            <Card key={a.id}>
              <CardHeader className="py-3 flex flex-row items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                    <Wrench className="size-4 text-primary" />
                    {a.reference}
                    <StatusPill status={a.status} />
                    {ready && ALLOCATING_STATUSES.includes(a.status) && (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                        Stock ready
                      </Badge>
                    )}
                    {!ready && a.status !== "Draft" && a.status !== "Completed" && (
                      <Badge variant="outline" className="border-destructive/40 text-destructive">
                        Stock short
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {a.customer ? <span className="text-foreground">{a.customer}</span> : <span>(no customer)</span>}
                    {" · "}
                    {fin?.productName ?? "(no product)"} · {a.unitsToProduce.toLocaleString()} units
                    {a.scheduledFor ? ` · ${new Date(a.scheduledFor).toLocaleString()}` : ""}
                  </CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => setExpandedId(expanded ? null : a.id)}>
                    {expanded ? "Hide details" : "View details"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(a)}>Edit</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm(`Delete ${a.reference}?`)) deleteAssembly(a.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <StatusPipeline assembly={a} onAdvance={(patch) => upsertAssembly({ ...a, ...patch })} />
                <RequirementsCard calc={calc} stock={stock} allocations={otherAlloc} compact />
                {expanded && (
                  <AssemblyDetail
                    assembly={a}
                    finished={fin}
                    bulk={blk}
                    onPatch={(patch) => upsertAssembly({ ...a, ...patch })}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
        {assemblies.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No assemblies yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------- Status pipeline & detail ----------

function StatusPipeline({
  assembly,
  onAdvance,
}: {
  assembly: ProductionAssembly;
  onAdvance: (patch: Partial<ProductionAssembly>) => void;
}) {
  const stages: AssemblyStatus[] = ["Planned", "Ready", "Mixing", "Filling", "QC Hold", "Completed"];
  const currentIdx = stages.indexOf(assembly.status);

  function setStatus(next: AssemblyStatus) {
    const patch: Partial<ProductionAssembly> = { status: next };
    if (next === "Mixing" && !assembly.actualStart) patch.actualStart = new Date().toISOString();
    if (next === "Completed" && !assembly.actualEnd) patch.actualEnd = new Date().toISOString();
    onAdvance(patch);
  }

  return (
    <div className="flex items-center gap-1 flex-wrap rounded-md border border-border bg-card/40 p-1.5">
      {stages.map((s, i) => {
        const active = i === currentIdx;
        const done = currentIdx > i;
        return (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "px-2.5 py-1 text-xs rounded transition-colors",
              active && "bg-primary text-primary-foreground",
              done && !active && "bg-primary/20 text-primary",
              !active && !done && "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

function AssemblyDetail({
  assembly,
  finished,
  bulk,
  onPatch,
}: {
  assembly: ProductionAssembly;
  finished?: FinishedProductBOM;
  bulk?: BulkFormulaBOM;
  onPatch: (patch: Partial<ProductionAssembly>) => void;
}) {
  const { getSpecForJob } = useCustomerSpecs();
  const spec = assembly.customer && finished
    ? getSpecForJob(assembly.customer, finished.productName)
    : undefined;

  const runtimeMs =
    assembly.actualStart
      ? (assembly.actualEnd ? new Date(assembly.actualEnd).getTime() : Date.now()) -
        new Date(assembly.actualStart).getTime()
      : 0;
  const runtimeHrs = runtimeMs > 0 ? (runtimeMs / 3_600_000).toFixed(2) : "—";

  return (
    <div className="grid md:grid-cols-2 gap-3 pt-1">
      {/* Formula / BOM */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Formula & BOM</div>
        {bulk ? (
          <>
            <div className="text-sm">{bulk.productName} · <span className="text-muted-foreground">{bulk.formulaSku}</span></div>
            <div className="text-xs text-muted-foreground">Base batch {bulk.baseBatchSize} L</div>
            <ul className="text-xs space-y-0.5">
              {bulk.ingredients.map((i) => (
                <li key={i.id} className="flex justify-between">
                  <span className="truncate">{i.name}</span>
                  <span className="text-muted-foreground">{i.quantity}{i.unit}</span>
                </li>
              ))}
            </ul>
            {bulk.notes && (
              <div className="text-xs text-muted-foreground italic pt-1 border-t border-border/50">
                {bulk.notes}
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-muted-foreground">No bulk formula linked.</div>
        )}
      </div>

      {/* Packaging */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Packaging</div>
        {finished ? (
          <div className="text-xs space-y-1">
            <div>{finished.productName} ({finished.containerSize}{finished.containerUnit})</div>
            <div className="text-muted-foreground">Bottle: {finished.bottleSku}</div>
            <div className="text-muted-foreground">Cap: {finished.capSku}</div>
            <div className="text-muted-foreground">Label: {finished.labelSku}</div>
            <div className="text-muted-foreground">Carton: {finished.cartonSku} · {finished.unitsPerCarton}/ctn</div>
            {finished.cartonsPerPallet && (
              <div className="text-muted-foreground">{finished.cartonsPerPallet} ctn/pallet</div>
            )}
            {finished.palletNotes && (
              <div className="italic text-muted-foreground pt-1 border-t border-border/50">{finished.palletNotes}</div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No finished product.</div>
        )}
      </div>

      {/* Customer specs */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Customer specs</div>
        {spec ? (
          <div className="text-xs space-y-1">
            <Badge variant="secondary" className="text-[10px]">
              {spec.source === "product" ? "Product-level" : "Customer default"}
            </Badge>
            {spec.filling.labelRequirements && <div><span className="text-muted-foreground">Label: </span>{spec.filling.labelRequirements}</div>}
            {spec.packing.unitsPerCarton ? <div><span className="text-muted-foreground">Units/carton: </span>{spec.packing.unitsPerCarton}</div> : null}
            {spec.palletising.cartonsPerLayer ? <div><span className="text-muted-foreground">Pallet: </span>{spec.palletising.cartonsPerLayer}×{spec.palletising.layersHigh}</div> : null}
            {"lineSetupNotes" in spec && spec.lineSetupNotes && (
              <div className="text-muted-foreground italic">{spec.lineSetupNotes}</div>
            )}
            {"specialInstructions" in spec && spec.specialInstructions && (
              <div className="text-amber-500 italic">⚠ {spec.specialInstructions}</div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No customer specs for this product.</div>
        )}
      </div>

      {/* QC + runtime */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">QC & runtime</div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">QC</Label>
          <Select
            value={assembly.qcStatus ?? "Pending"}
            onValueChange={(v) => onPatch({ qcStatus: v as AssemblyQcStatus })}
          >
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Pass">Pass</SelectItem>
              <SelectItem value="Hold">Hold</SelectItem>
              <SelectItem value="Fail">Fail</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs space-y-0.5">
          <div><span className="text-muted-foreground">Started: </span>{assembly.actualStart ? new Date(assembly.actualStart).toLocaleString() : "—"}</div>
          <div><span className="text-muted-foreground">Finished: </span>{assembly.actualEnd ? new Date(assembly.actualEnd).toLocaleString() : "—"}</div>
          <div><span className="text-muted-foreground">Runtime: </span>{runtimeHrs} h</div>
        </div>
        {assembly.notes && (
          <div className="text-xs italic text-muted-foreground pt-1 border-t border-border/50">
            {assembly.notes}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: AssemblyStatus }) {
  const color =
    status === "Completed" ? "border-emerald-500/40 text-emerald-500"
    : status === "QC Hold" ? "border-amber-500/40 text-amber-500"
    : status === "Filling" ? "border-sky-500/40 text-sky-500"
    : status === "Mixing" ? "border-primary/40 text-primary"
    : status === "Ready" ? "border-emerald-500/40 text-emerald-500"
    : "border-border text-muted-foreground";
  return <Badge variant="outline" className={color}>{status}</Badge>;
}


// ============= Stock check =============

function StockCheckTab() {
  const { assemblies, finishedBOMs, bulkBOMs, stock } = useManufacturing();
  const [selected, setSelected] = useState<string>(assemblies[0]?.id ?? "");
  const asm = assemblies.find((a) => a.id === selected);
  const fin = asm ? finishedBOMs.find((f) => f.id === asm.finishedProductId) : undefined;
  const blk = fin ? bulkBOMs.find((b) => b.id === fin.bulkFormulaId) : undefined;
  const calc = asm ? calculateAssembly(asm.unitsToProduce, fin, blk) : null;
  const allocations = asm ? computeAllocations(assemblies, finishedBOMs, bulkBOMs, asm.id) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-sm">Assembly</Label>
        <Select value={selected || "_none"} onValueChange={(v) => setSelected(v === "_none" ? "" : v)}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Select assembly…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">(none)</SelectItem>
            {assemblies.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.reference} — {finishedBOMs.find((f) => f.id === a.finishedProductId)?.productName ?? "?"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!calc || !calc.finished ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select an assembly to check stock requirements.
          </CardContent>
        </Card>
      ) : (
        <RequirementsCard calc={calc} stock={stock} allocations={allocations} />
      )}
    </div>
  );
}

// ============= Shared requirements / stock card =============

function RequirementsCard({
  calc,
  stock,
  allocations,
  compact = false,
}: {
  calc: ReturnType<typeof calculateAssembly>;
  stock: { sku: string; name: string; availableStock: number }[];
  allocations?: Map<string, number>;
  compact?: boolean;
}) {
  const lines = checkStock(calc, stock as never, allocations);
  const blockers = lines.filter((l) => l.status !== "ok").length;

  return (
    <Card>
      {!compact && (
        <CardHeader className="py-3">
          <CardTitle className="text-base">Live stock readiness</CardTitle>
          <CardDescription>
            {calc.unitsToProduce.toLocaleString()} units · {calc.bulkLitresRequired.toLocaleString()} L bulk ·{" "}
            {calc.cartonsRequired.toLocaleString()} cartons
            {calc.palletsRequired ? ` · ${calc.palletsRequired} pallets` : ""}
            {blockers > 0 ? (
              <span className="ml-2 text-destructive font-medium">{blockers} stock issue(s)</span>
            ) : (
              <span className="ml-2 text-emerald-500 font-medium">All stock available</span>
            )}
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className={compact ? "p-0" : undefined}>
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Required</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Missing</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "uppercase text-[10px]",
                          l.category === "bulk" && "border-primary/40 text-primary",
                          l.category === "raw" && "border-amber-500/40 text-amber-500",
                          l.category === "packaging" && "border-sky-500/40 text-sky-500",
                        )}
                      >
                        {l.category}
                      </Badge>
                      <span>{l.label}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {l.sku ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.required.toLocaleString()} {l.unit}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {l.onHand.toLocaleString()} {l.unit}
                  </TableCell>
                  <TableCell className="text-right text-amber-500/90">
                    {l.allocatedOther > 0 ? `${l.allocatedOther.toLocaleString()} ${l.unit}` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {l.available.toLocaleString()} {l.unit}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.missing > 0 ? `${l.missing.toLocaleString()} ${l.unit}` : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: "ok" | "low" | "missing" }) {
  if (status === "ok")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
        <CheckCircle2 className="size-3.5" /> In stock
      </span>
    );
  if (status === "low")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-500">
        <CircleAlert className="size-3.5" /> Short
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-destructive">
      <CircleX className="size-3.5" /> Missing
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
