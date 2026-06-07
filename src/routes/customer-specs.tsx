import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, Plus, Trash2, Upload, ClipboardList, Package2, ArrowLeft, UserPlus, Mail, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import {
  useCustomerSpecs,
  type CustomerSpec,
  type ProductSpec,
  type SpecPayload,
} from "@/lib/customer-specs";
import { CustomerSpecsView } from "@/components/customer-specs/CustomerSpecsView";

export const Route = createFileRoute("/customer-specs")({
  component: CustomerSpecsPage,
});

type EditMode =
  | { kind: "none" }
  | { kind: "customer"; draft: CustomerSpec }
  | { kind: "product"; customerId: string; draft: ProductSpec };

interface CustomerInfoDraft {
  id?: string;
  customer: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

function CustomerSpecsPage() {
  const { jobs } = useStore();
  const {
    specs,
    upsertSpec,
    deleteSpec,
    upsertProduct,
    deleteProduct,
    createEmpty,
    createEmptyProduct,
  } = useCustomerSpecs();

  const allCustomers = useMemo(() => {
    const set = new Set<string>(specs.map((s) => s.customer));
    jobs.forEach((j) => set.add(j.customer));
    return Array.from(set).sort();
  }, [specs, jobs]);

  const [selected, setSelected] = useState<string>(specs[0]?.customer ?? allCustomers[0] ?? "");
  const [newProductName, setNewProductName] = useState("");
  const [edit, setEdit] = useState<EditMode>({ kind: "none" });
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);
  const [customerInfoDraft, setCustomerInfoDraft] = useState<CustomerInfoDraft | null>(null);
  const newProductInputRef = useRef<HTMLInputElement>(null);

  const existing = useMemo(
    () => specs.find((s) => s.customer === selected),
    [specs, selected],
  );

  const viewingProduct = useMemo(
    () => (existing && viewingProductId ? existing.products.find((p) => p.id === viewingProductId) : undefined),
    [existing, viewingProductId],
  );

  function startEditCustomer() {
    if (!existing && !selected) return;
    const base = existing ?? createEmpty(selected);
    setEdit({ kind: "customer", draft: JSON.parse(JSON.stringify(base)) });
  }
  function startEditProduct(p: ProductSpec) {
    if (!existing) return;
    setEdit({ kind: "product", customerId: existing.id, draft: JSON.parse(JSON.stringify(p)) });
  }
  function startNewProduct() {
    if (!existing) return;
    const name = newProductName.trim();
    if (!name) {
      toast.error("Enter a product name first");
      newProductInputRef.current?.focus();
      return;
    }
    if (existing.products.some((p) => p.productName.toLowerCase() === name.toLowerCase())) {
      toast.error("That product already exists for this customer");
      return;
    }
    const draft = createEmptyProduct(name);
    // Seed product overrides from customer defaults so the editor isn't empty
    draft.filling = { ...existing.filling };
    draft.packing = { ...existing.packing };
    draft.palletising = { ...existing.palletising };
    setNewProductName("");
    setEdit({ kind: "product", customerId: existing.id, draft });
  }
  function cancelEdit() {
    setEdit({ kind: "none" });
  }
  function save() {
    if (edit.kind === "customer") {
      if (!edit.draft.customer.trim()) return toast.error("Customer name is required");
      upsertSpec(edit.draft);
      setSelected(edit.draft.customer);
      toast.success(`Saved customer defaults for ${edit.draft.customer}`);
      setEdit({ kind: "none" });
    } else if (edit.kind === "product") {
      if (!edit.draft.productName.trim()) return toast.error("Product name is required");
      upsertProduct(edit.customerId, edit.draft);
      toast.success(`Saved product specs for ${edit.draft.productName}`);
      setEdit({ kind: "none" });
    }
  }

  function addCustomer() {
    const name = newCustomerName.trim();
    if (!name) {
      toast.error("Enter a customer name first");
      newCustomerInputRef.current?.focus();
      return;
    }
    if (specs.some((s) => s.customer.toLowerCase() === name.toLowerCase())) {
      toast.error("That customer already has specs");
      return;
    }
    const spec = createEmpty(name);
    upsertSpec(spec);
    setSelected(name);
    setNewCustomerName("");
    setEdit({ kind: "customer", draft: JSON.parse(JSON.stringify(spec)) });
  }

  function removeSelected() {
    if (!existing) return;
    if (!confirm(`Delete all specs for ${existing.customer}?`)) return;
    deleteSpec(existing.id);
    setSelected(specs.find((s) => s.id !== existing.id)?.customer ?? "");
    setEdit({ kind: "none" });
    setViewingProductId(null);
  }

  function removeProduct(p: ProductSpec) {
    if (!existing) return;
    if (!confirm(`Delete product specs for ${p.productName}?`)) return;
    deleteProduct(existing.id, p.id);
    if (viewingProductId === p.id) setViewingProductId(null);
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <ClipboardList className="size-6 text-primary" />
              Customer Specs
            </h1>
            <p className="text-sm text-muted-foreground">
              Customer defaults and per-product overrides that flow automatically into every job.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              ref={newCustomerInputRef}
              placeholder="New customer name"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustomer(); }}
              className="w-56"
            />
            <Button onClick={addCustomer}>
              <Plus className="size-4 mr-1" /> Add customer
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[260px_1fr] gap-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Customers</CardTitle>
              <CardDescription>{specs.length} saved · {allCustomers.length} total</CardDescription>
            </CardHeader>
            <CardContent className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
              {allCustomers.map((c) => {
                const cs = specs.find((s) => s.customer === c);
                const active = c === selected;
                return (
                  <button
                    key={c}
                    onClick={() => {
                      setSelected(c);
                      setEdit({ kind: "none" });
                      setViewingProductId(null);
                    }}
                    className={
                      "w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-2 transition-colors " +
                      (active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60 text-muted-foreground")
                    }
                  >
                    <span className="truncate">{c}</span>
                    {cs ? (
                      <Badge variant="secondary" className="shrink-0">
                        {cs.products.length > 0 ? `${cs.products.length}p` : "specs"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">none</Badge>
                    )}
                  </button>
                );
              })}
              {allCustomers.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-6">
                  No customers yet.
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4 min-w-0">
            {!selected ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                Select a customer to view or edit their production specs.
              </CardContent></Card>
            ) : !existing ? (
              <Card><CardContent className="py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  No specs saved for <strong>{selected}</strong> yet.
                </p>
                <Button onClick={startEditCustomer}>
                  <Plus className="size-4 mr-1" /> Create specs
                </Button>
              </CardContent></Card>
            ) : edit.kind === "customer" ? (
              <SpecEditor
                title={`${edit.draft.customer || "Customer"} — defaults`}
                payload={edit.draft}
                onPayload={(p) => setEdit({ ...edit, draft: { ...edit.draft, ...p } })}
                headerExtra={
                  <Input
                    value={edit.draft.customer}
                    onChange={(e) => setEdit({ ...edit, draft: { ...edit.draft, customer: e.target.value } })}
                    placeholder="Customer name"
                    className="max-w-sm text-lg font-semibold"
                  />
                }
                onCancel={cancelEdit}
                onSave={save}
              />
            ) : edit.kind === "product" ? (
              <SpecEditor
                title={`Product — ${edit.draft.productName || "(unnamed)"}`}
                payload={edit.draft}
                onPayload={(p) => setEdit({ ...edit, draft: { ...edit.draft, ...p } })}
                headerExtra={
                  <Input
                    value={edit.draft.productName}
                    onChange={(e) => setEdit({ ...edit, draft: { ...edit.draft, productName: e.target.value } })}
                    placeholder="Product name (e.g. Purple Power Wash 1L)"
                    className="max-w-sm text-lg font-semibold"
                  />
                }
                productExtras={{
                  lineSetupNotes: edit.draft.lineSetupNotes,
                  specialInstructions: edit.draft.specialInstructions,
                  onLineSetup: (v) => setEdit({ ...edit, draft: { ...edit.draft, lineSetupNotes: v } }),
                  onSpecial: (v) => setEdit({ ...edit, draft: { ...edit.draft, specialInstructions: v } }),
                }}
                onCancel={cancelEdit}
                onSave={save}
              />
            ) : viewingProduct ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setViewingProductId(null)}>
                      <ArrowLeft className="size-4 mr-1" /> Back to {existing.customer}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => removeProduct(viewingProduct)}>
                      <Trash2 className="size-4 mr-1" /> Delete product
                    </Button>
                    <Button onClick={() => startEditProduct(viewingProduct)}>Edit product</Button>
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Package2 className="size-5 text-primary" />
                    {viewingProduct.productName}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {existing.customer} · updated {new Date(viewingProduct.updatedAt).toLocaleString()}
                  </p>
                </div>
                <CustomerSpecsView spec={viewingProduct} />
                {(viewingProduct.lineSetupNotes || viewingProduct.specialInstructions) && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-base">Line setup & special instructions</CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Line setup notes</div>
                        <div className="whitespace-pre-wrap">{viewingProduct.lineSetupNotes || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Special instructions</div>
                        <div className="whitespace-pre-wrap">{viewingProduct.specialInstructions || "—"}</div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-semibold">{existing.customer}</h2>
                    <p className="text-xs text-muted-foreground">
                      Customer defaults · updated {new Date(existing.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={removeSelected}>
                      <Trash2 className="size-4 mr-1" /> Delete customer
                    </Button>
                    <Button onClick={startEditCustomer}>Edit defaults</Button>
                  </div>
                </div>

                <Card>
                  <CardHeader className="py-3 flex flex-row items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Package2 className="size-4 text-primary" />
                        Product specifications ({existing.products.length})
                      </CardTitle>
                      <CardDescription>
                        Per-product overrides — used automatically when a job matches.
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        ref={newProductInputRef}
                        placeholder="New product name"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") startNewProduct(); }}
                        className="w-64"
                      />
                      <Button onClick={startNewProduct}>
                        <Plus className="size-4 mr-1" /> Add product
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {existing.products.length === 0 ? (
                      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No product overrides yet. Jobs for this customer use the defaults below.
                      </div>
                    ) : (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {existing.products.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setViewingProductId(p.id)}
                            className="text-left rounded-md border border-border bg-card/60 hover:bg-accent/40 transition-colors p-3 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium truncate">{p.productName}</div>
                              <Badge variant="secondary" className="shrink-0">product</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground space-x-2">
                              <span>{p.packing.unitsPerCarton}/ctn</span>
                              <span>·</span>
                              <span>{p.palletising.cartonsPerLayer}×{p.palletising.layersHigh} pallet</span>
                            </div>
                            {p.specialInstructions && (
                              <div className="text-xs line-clamp-2 text-muted-foreground">{p.specialInstructions}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Customer defaults
                  </h3>
                  <CustomerSpecsView spec={existing} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ----- Spec editor (shared between customer-defaults and product overrides) -----

interface SpecEditorProps {
  title: string;
  payload: SpecPayload;
  onPayload: (patch: Partial<SpecPayload>) => void;
  headerExtra?: React.ReactNode;
  onCancel: () => void;
  onSave: () => void;
  productExtras?: {
    lineSetupNotes: string;
    specialInstructions: string;
    onLineSetup: (v: string) => void;
    onSpecial: (v: string) => void;
  };
}

function SpecEditor({ title, payload, onPayload, headerExtra, onCancel, onSave, productExtras }: SpecEditorProps) {
  function patchSection<S extends "filling" | "packing" | "palletising">(
    section: S,
    value: Partial<SpecPayload[S]>,
  ) {
    onPayload({ [section]: { ...payload[section], ...value } } as Partial<SpecPayload>);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
          {headerExtra}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onSave}>
            <Save className="size-4 mr-1" /> Save
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base">Filling instructions</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <Field label="Product type"><Input value={payload.filling.productType} onChange={(e) => patchSection("filling", { productType: e.target.value })} /></Field>
          <Field label="Bottle / container type"><Input value={payload.filling.containerType} onChange={(e) => patchSection("filling", { containerType: e.target.value })} /></Field>
          <Field label="Fill size"><Input value={payload.filling.fillSize} onChange={(e) => patchSection("filling", { fillSize: e.target.value })} /></Field>
          <Field label="Cap type"><Input value={payload.filling.capType} onChange={(e) => patchSection("filling", { capType: e.target.value })} /></Field>
          <Field label="Trigger / sprayer requirements"><Input value={payload.filling.triggerSprayer} onChange={(e) => patchSection("filling", { triggerSprayer: e.target.value })} /></Field>
          <Field label="Label positioning notes"><Input value={payload.filling.labelPositioning} onChange={(e) => patchSection("filling", { labelPositioning: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="Label requirements"><Textarea rows={2} value={payload.filling.labelRequirements} onChange={(e) => patchSection("filling", { labelRequirements: e.target.value })} /></Field></div>
          <div className="md:col-span-2"><Field label="Hazard / SDS notes"><Textarea rows={2} value={payload.filling.hazardSdsNotes} onChange={(e) => patchSection("filling", { hazardSdsNotes: e.target.value })} /></Field></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base">Packing instructions</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <Field label="Units per carton"><Input type="number" value={payload.packing.unitsPerCarton} onChange={(e) => patchSection("packing", { unitsPerCarton: Number(e.target.value) || 0 })} /></Field>
          <Field label="Carton type"><Input value={payload.packing.cartonType} onChange={(e) => patchSection("packing", { cartonType: e.target.value })} /></Field>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label className="text-sm">Carton label required</Label>
            <Switch checked={payload.packing.cartonLabelRequired} onCheckedChange={(v) => patchSection("packing", { cartonLabelRequired: v })} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label className="text-sm">Trigger / sprayer packed in carton</Label>
            <Switch checked={payload.packing.triggerInCarton} onCheckedChange={(v) => patchSection("packing", { triggerInCarton: v })} />
          </div>
          <div className="md:col-span-2"><Field label="Special packing notes"><Textarea rows={2} value={payload.packing.packingNotes} onChange={(e) => patchSection("packing", { packingNotes: e.target.value })} /></Field></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-base">Palletising instructions</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <Field label="Pallet type">
            <Select value={payload.palletising.palletType || ""} onValueChange={(v) => patchSection("palletising", { palletType: v })}>
              <SelectTrigger><SelectValue placeholder="Select pallet" /></SelectTrigger>
              <SelectContent>
                {["Standard CHEP","CHEP 1165 x 1165","CHEP 1165","Euro 1200 x 800","Heat-treated softwood 1200 x 1000","Heat-treated hardwood 1200 x 1000","Plastic export pallet"].map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cartons per layer"><Input type="number" value={payload.palletising.cartonsPerLayer} onChange={(e) => patchSection("palletising", { cartonsPerLayer: Number(e.target.value) || 0 })} /></Field>
            <Field label="Layers high"><Input type="number" value={payload.palletising.layersHigh} onChange={(e) => patchSection("palletising", { layersHigh: Number(e.target.value) || 0 })} /></Field>
          </div>
          <div className="md:col-span-2"><Field label="Pallet configuration notes"><Textarea rows={2} value={payload.palletising.configurationNotes} onChange={(e) => patchSection("palletising", { configurationNotes: e.target.value })} /></Field></div>
          <div className="md:col-span-2"><Field label="Wrap requirements"><Textarea rows={2} value={payload.palletising.wrapRequirements} onChange={(e) => patchSection("palletising", { wrapRequirements: e.target.value })} /></Field></div>
          <div className="md:col-span-2"><Field label="Pallet label requirements"><Textarea rows={2} value={payload.palletising.palletLabelRequirements} onChange={(e) => patchSection("palletising", { palletLabelRequirements: e.target.value })} /></Field></div>
          <div className="md:col-span-2"><Field label="Special customer requirements"><Textarea rows={2} value={payload.palletising.specialRequirements} onChange={(e) => patchSection("palletising", { specialRequirements: e.target.value })} /></Field></div>
        </CardContent>
      </Card>

      {productExtras && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Line setup & special instructions</CardTitle>
            <CardDescription>Product-specific line setup and operator notes.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-3">
            <Field label="Line setup notes">
              <Textarea rows={3} value={productExtras.lineSetupNotes} onChange={(e) => productExtras.onLineSetup(e.target.value)} />
            </Field>
            <Field label="Special instructions">
              <Textarea rows={3} value={productExtras.specialInstructions} onChange={(e) => productExtras.onSpecial(e.target.value)} />
            </Field>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Reference files / photos</CardTitle>
          <CardDescription>Mock upload — will move to cloud storage later.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <PhotoUpload label="Example pallet photo" value={payload.references.palletPhoto} onChange={(v) => onPayload({ references: { ...payload.references, palletPhoto: v } })} />
          <PhotoUpload label="Example carton photo" value={payload.references.cartonPhoto} onChange={(v) => onPayload({ references: { ...payload.references, cartonPhoto: v } })} />
          <PhotoUpload label="Example label placement" value={payload.references.labelPhoto} onChange={(v) => onPayload({ references: { ...payload.references, labelPhoto: v } })} />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function PhotoUpload({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === "string" ? reader.result : undefined);
    reader.readAsDataURL(f);
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="aspect-video rounded-md border border-dashed border-border bg-muted/30 grid place-items-center overflow-hidden">
        {value ? (
          <img src={value} alt={label} className="object-cover w-full h-full" />
        ) : (
          <span className="text-xs text-muted-foreground">No photo</span>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4 mr-1" /> Upload
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Remove
          </Button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>
    </div>
  );
}
