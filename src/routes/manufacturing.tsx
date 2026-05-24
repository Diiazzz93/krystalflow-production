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
  calculateAssembly,
  checkStock,
  useManufacturing,
  type BulkFormulaBOM,
  type BulkIngredient,
  type FinishedProductBOM,
  type ProductionAssembly,
} from "@/lib/manufacturing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/manufacturing")({
  component: ManufacturingPage,
});

function ManufacturingPage() {
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

        <Tabs defaultValue="bulk" className="w-full">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-auto h-auto">
            <TabsTrigger value="bulk" className="gap-2 py-2">
              <Beaker className="size-4" /> Bulk BOMs
            </TabsTrigger>
            <TabsTrigger value="finished" className="gap-2 py-2">
              <Package className="size-4" /> Finished BOMs
            </TabsTrigger>
            <TabsTrigger value="assemblies" className="gap-2 py-2">
              <Wrench className="size-4" /> Assemblies
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-2 py-2">
              <Boxes className="size-4" /> Stock Check
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bulk" className="mt-4">
            <BulkBOMsTab />
          </TabsContent>
          <TabsContent value="finished" className="mt-4">
            <FinishedBOMsTab />
          </TabsContent>
          <TabsContent value="assemblies" className="mt-4">
            <AssembliesTab />
          </TabsContent>
          <TabsContent value="stock" className="mt-4">
            <StockCheckTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
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
  const { assemblies, finishedBOMs, bulkBOMs, upsertAssembly, deleteAssembly, newAssembly, stock } =
    useManufacturing();
  const [editing, setEditing] = useState<ProductionAssembly | null>(null);

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

  const previewCalc = useMemo(() => {
    if (!editing) return null;
    const fin = finishedBOMs.find((f) => f.id === editing.finishedProductId);
    const blk = fin ? bulkBOMs.find((b) => b.id === fin.bulkFormulaId) : undefined;
    return calculateAssembly(editing.unitsToProduce, fin, blk);
  }, [editing, finishedBOMs, bulkBOMs]);

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
                  onValueChange={(v) => setEditing({ ...editing, status: v as ProductionAssembly["status"] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Planned">Planned</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Complete">Complete</SelectItem>
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
          <RequirementsCard calc={previewCalc} stock={stock} />
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
          return (
            <Card key={a.id}>
              <CardHeader className="py-3 flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="size-4 text-primary" />
                    {a.reference}
                    <Badge variant="secondary">{a.status}</Badge>
                  </CardTitle>
                  <CardDescription>
                    {fin?.productName ?? "(no product)"} · {a.unitsToProduce.toLocaleString()} units
                    {a.scheduledFor ? ` · ${new Date(a.scheduledFor).toLocaleString()}` : ""}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
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
              <CardContent>
                <RequirementsCard calc={calc} stock={stock} compact />
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

// ============= Stock check =============

function StockCheckTab() {
  const { assemblies, finishedBOMs, bulkBOMs, stock } = useManufacturing();
  const [selected, setSelected] = useState<string>(assemblies[0]?.id ?? "");
  const asm = assemblies.find((a) => a.id === selected);
  const fin = asm ? finishedBOMs.find((f) => f.id === asm.finishedProductId) : undefined;
  const blk = fin ? bulkBOMs.find((b) => b.id === fin.bulkFormulaId) : undefined;
  const calc = asm ? calculateAssembly(asm.unitsToProduce, fin, blk) : null;

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
        <RequirementsCard calc={calc} stock={stock} />
      )}
    </div>
  );
}

// ============= Shared requirements / stock card =============

function RequirementsCard({
  calc,
  stock,
  compact = false,
}: {
  calc: ReturnType<typeof calculateAssembly>;
  stock: { sku: string; name: string; availableStock: number }[];
  compact?: boolean;
}) {
  const lines = checkStock(calc, stock as never);
  const blockers = lines.filter((l) => l.status !== "ok").length;

  return (
    <Card>
      {!compact && (
        <CardHeader className="py-3">
          <CardTitle className="text-base">Requirements & stock check</CardTitle>
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
                  <TableCell className="text-right">
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
