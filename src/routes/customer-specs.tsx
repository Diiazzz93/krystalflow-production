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
import { Save, Plus, Trash2, Upload, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useCustomerSpecs, type CustomerSpec } from "@/lib/customer-specs";
import { CustomerSpecsView } from "@/components/customer-specs/CustomerSpecsView";

export const Route = createFileRoute("/customer-specs")({
  component: CustomerSpecsPage,
});

function CustomerSpecsPage() {
  const { jobs } = useStore();
  const { specs, upsertSpec, deleteSpec, createEmpty } = useCustomerSpecs();

  const allCustomers = useMemo(() => {
    const set = new Set<string>(specs.map((s) => s.customer));
    jobs.forEach((j) => set.add(j.customer));
    return Array.from(set).sort();
  }, [specs, jobs]);

  const [selected, setSelected] = useState<string>(specs[0]?.customer ?? allCustomers[0] ?? "");
  const [draft, setDraft] = useState<CustomerSpec | null>(null);
  const [newCustomerName, setNewCustomerName] = useState("");

  const existing = useMemo(
    () => specs.find((s) => s.customer === selected),
    [specs, selected],
  );

  const active = draft ?? existing ?? null;

  function startEdit() {
    const base = existing ?? createEmpty(selected || "New customer");
    setDraft(JSON.parse(JSON.stringify(base)));
  }

  function cancelEdit() {
    setDraft(null);
  }

  function save() {
    if (!draft) return;
    if (!draft.customer.trim()) {
      toast.error("Customer name is required");
      return;
    }
    upsertSpec(draft);
    setSelected(draft.customer);
    setDraft(null);
    toast.success(`Saved specs for ${draft.customer}`);
  }

  function addCustomer() {
    const name = newCustomerName.trim();
    if (!name) return;
    if (specs.some((s) => s.customer.toLowerCase() === name.toLowerCase())) {
      toast.error("That customer already has specs");
      return;
    }
    const spec = createEmpty(name);
    upsertSpec(spec);
    setSelected(name);
    setNewCustomerName("");
    setDraft(JSON.parse(JSON.stringify(spec)));
  }

  function removeSelected() {
    if (!existing) return;
    if (!confirm(`Delete production specs for ${existing.customer}?`)) return;
    deleteSpec(existing.id);
    setSelected(specs.find((s) => s.id !== existing.id)?.customer ?? "");
    setDraft(null);
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
              Saved filling, packing and palletising instructions that flow automatically into every job.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="New customer name"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
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
                const hasSpec = specs.some((s) => s.customer === c);
                const active = c === selected;
                return (
                  <button
                    key={c}
                    onClick={() => {
                      setSelected(c);
                      setDraft(null);
                    }}
                    className={
                      "w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-2 transition-colors " +
                      (active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60 text-muted-foreground")
                    }
                  >
                    <span className="truncate">{c}</span>
                    {hasSpec ? (
                      <Badge variant="secondary" className="shrink-0">specs</Badge>
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
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Select a customer to view or edit their production specs.
                </CardContent>
              </Card>
            ) : !active ? (
              <Card>
                <CardContent className="py-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    No specs saved for <strong>{selected}</strong> yet.
                  </p>
                  <Button onClick={startEdit}>
                    <Plus className="size-4 mr-1" /> Create specs
                  </Button>
                </CardContent>
              </Card>
            ) : draft ? (
              <SpecEditor
                spec={draft}
                onChange={setDraft}
                onCancel={cancelEdit}
                onSave={save}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-semibold">{existing!.customer}</h2>
                    <p className="text-xs text-muted-foreground">
                      Updated {new Date(existing!.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={removeSelected}>
                      <Trash2 className="size-4 mr-1" /> Delete
                    </Button>
                    <Button onClick={startEdit}>Edit specs</Button>
                  </div>
                </div>
                <CustomerSpecsView spec={existing!} />
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SpecEditor({
  spec,
  onChange,
  onCancel,
  onSave,
}: {
  spec: CustomerSpec;
  onChange: (s: CustomerSpec) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  function patch<K extends keyof CustomerSpec>(key: K, value: CustomerSpec[K]) {
    onChange({ ...spec, [key]: value });
  }
  function patchSection<S extends "filling" | "packing" | "palletising">(
    section: S,
    value: Partial<CustomerSpec[S]>,
  ) {
    onChange({ ...spec, [section]: { ...spec[section], ...value } } as CustomerSpec);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={spec.customer}
          onChange={(e) => patch("customer", e.target.value)}
          placeholder="Customer name"
          className="max-w-sm text-lg font-semibold"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onSave}>
            <Save className="size-4 mr-1" /> Save specs
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Filling instructions</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <Field label="Product type">
            <Input value={spec.filling.productType} onChange={(e) => patchSection("filling", { productType: e.target.value })} />
          </Field>
          <Field label="Bottle / container type">
            <Input value={spec.filling.containerType} onChange={(e) => patchSection("filling", { containerType: e.target.value })} />
          </Field>
          <Field label="Fill size">
            <Input value={spec.filling.fillSize} onChange={(e) => patchSection("filling", { fillSize: e.target.value })} />
          </Field>
          <Field label="Cap type">
            <Input value={spec.filling.capType} onChange={(e) => patchSection("filling", { capType: e.target.value })} />
          </Field>
          <Field label="Trigger / sprayer requirements">
            <Input value={spec.filling.triggerSprayer} onChange={(e) => patchSection("filling", { triggerSprayer: e.target.value })} />
          </Field>
          <Field label="Label positioning notes">
            <Input value={spec.filling.labelPositioning} onChange={(e) => patchSection("filling", { labelPositioning: e.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Label requirements">
              <Textarea rows={2} value={spec.filling.labelRequirements} onChange={(e) => patchSection("filling", { labelRequirements: e.target.value })} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Hazard / SDS notes">
              <Textarea rows={2} value={spec.filling.hazardSdsNotes} onChange={(e) => patchSection("filling", { hazardSdsNotes: e.target.value })} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Packing instructions</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <Field label="Units per carton">
            <Input
              type="number"
              value={spec.packing.unitsPerCarton}
              onChange={(e) => patchSection("packing", { unitsPerCarton: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Carton type">
            <Input value={spec.packing.cartonType} onChange={(e) => patchSection("packing", { cartonType: e.target.value })} />
          </Field>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label className="text-sm">Carton label required</Label>
            <Switch
              checked={spec.packing.cartonLabelRequired}
              onCheckedChange={(v) => patchSection("packing", { cartonLabelRequired: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label className="text-sm">Trigger / sprayer packed in carton</Label>
            <Switch
              checked={spec.packing.triggerInCarton}
              onCheckedChange={(v) => patchSection("packing", { triggerInCarton: v })}
            />
          </div>
          <div className="md:col-span-2">
            <Field label="Special packing notes">
              <Textarea rows={2} value={spec.packing.packingNotes} onChange={(e) => patchSection("packing", { packingNotes: e.target.value })} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Palletising instructions</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <Field label="Pallet type">
            <Select
              value={spec.palletising.palletType || ""}
              onValueChange={(v) => patchSection("palletising", { palletType: v })}
            >
              <SelectTrigger><SelectValue placeholder="Select pallet" /></SelectTrigger>
              <SelectContent>
                {[
                  "Standard CHEP",
                  "CHEP 1165 x 1165",
                  "CHEP 1165",
                  "Euro 1200 x 800",
                  "Heat-treated softwood 1200 x 1000",
                  "Heat-treated hardwood 1200 x 1000",
                  "Plastic export pallet",
                ].map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cartons per layer">
              <Input
                type="number"
                value={spec.palletising.cartonsPerLayer}
                onChange={(e) => patchSection("palletising", { cartonsPerLayer: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Layers high">
              <Input
                type="number"
                value={spec.palletising.layersHigh}
                onChange={(e) => patchSection("palletising", { layersHigh: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Pallet configuration notes">
              <Textarea rows={2} value={spec.palletising.configurationNotes} onChange={(e) => patchSection("palletising", { configurationNotes: e.target.value })} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Wrap requirements">
              <Textarea rows={2} value={spec.palletising.wrapRequirements} onChange={(e) => patchSection("palletising", { wrapRequirements: e.target.value })} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Pallet label requirements">
              <Textarea rows={2} value={spec.palletising.palletLabelRequirements} onChange={(e) => patchSection("palletising", { palletLabelRequirements: e.target.value })} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Special customer requirements">
              <Textarea rows={2} value={spec.palletising.specialRequirements} onChange={(e) => patchSection("palletising", { specialRequirements: e.target.value })} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Reference files / photos</CardTitle>
          <CardDescription>Mock upload — will move to cloud storage later.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <PhotoUpload
            label="Example pallet photo"
            value={spec.references.palletPhoto}
            onChange={(v) => onChange({ ...spec, references: { ...spec.references, palletPhoto: v } })}
          />
          <PhotoUpload
            label="Example carton photo"
            value={spec.references.cartonPhoto}
            onChange={(v) => onChange({ ...spec, references: { ...spec.references, cartonPhoto: v } })}
          />
          <PhotoUpload
            label="Example label placement"
            value={spec.references.labelPhoto}
            onChange={(v) => onChange({ ...spec, references: { ...spec.references, labelPhoto: v } })}
          />
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
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
      </div>
    </div>
  );
}
