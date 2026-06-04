import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  
  deleteCustomPreset,
  getCustomPresets,
  subscribeToPresets,
  upsertCustomPreset,
  type QCPreset,
} from "@/lib/qc-presets";
import { UnleashedSyncPanel } from "@/components/settings/UnleashedSyncPanel";
import { UserManagementPanel } from "@/components/settings/UserManagementPanel";
import { BrandingPanel } from "@/components/settings/BrandingPanel";
import { LinesPanel } from "@/components/settings/LinesPanel";
import { StockAlertsPanel } from "@/components/settings/StockAlertsPanel";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function emptyPreset(): QCPreset {
  return {
    id: `custom-${Date.now().toString(36)}`,
    name: "",
    description: "",
    values: {
      bottleWeight: undefined,
      capWeight: undefined,
      liquidWeightPer100ml: 100,
      totalWeightGrams: undefined,
      minimumVolume: undefined,
      maximumVolume: undefined,
      boxesPerPallet: undefined,
      bottleCount: undefined,
      palletRowVolumes: [
        { row: "1", pump1: "", pump2: "" },
        { row: "2", pump1: "", pump2: "" },
        { row: "3", pump1: "", pump2: "" },
      ],
    },
  };
}

function SettingsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [custom, setCustom] = useState<QCPreset[]>(() => getCustomPresets());
  const [editing, setEditing] = useState<QCPreset | null>(null);

  useEffect(() => subscribeToPresets(() => setCustom(getCustomPresets())), []);

  function startNew() {
    setEditing(emptyPreset());
  }

  function startEdit(p: QCPreset) {
    setEditing(JSON.parse(JSON.stringify(p)));
  }

  function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("Preset name is required");
      return;
    }
    upsertCustomPreset(editing);
    toast.success(`Saved preset "${editing.name}"`);
    setEditing(null);
  }

  function remove(id: string, name: string) {
    if (!confirm(`Delete preset "${name}"?`)) return;
    deleteCustomPreset(id);
    toast.success("Preset deleted");
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure presets and defaults used across the production app.
          </p>
        </div>

        {isAdmin && <UserManagementPanel />}

        <BrandingPanel />

        <LinesPanel />


        <UnleashedSyncPanel />

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Quality control presets</CardTitle>
              <CardDescription>
                Create reusable templates that pre-fill the QC / Filling Line Log Sheet.
              </CardDescription>
            </div>
            <Button onClick={startNew}>
              <Plus className="size-4" /> New preset
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Custom presets ({custom.length})
              </h3>
              {custom.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No custom presets yet. Click <strong>New preset</strong> to create one.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {custom.map((p) => (
                    <PresetCard
                      key={p.id}
                      preset={p}
                      onEdit={() => startEdit(p)}
                      onDelete={() => remove(p.id, p.name)}
                    />
                  ))}
                </div>
              )}
            </section>
          </CardContent>
        </Card>

        {editing && (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>{custom.some((p) => p.id === editing.id) ? "Edit preset" : "New preset"}</CardTitle>
                <CardDescription>
                  Only set the fields you want this preset to pre-fill. Leave the rest blank.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  <X className="size-4" /> Cancel
                </Button>
                <Button onClick={save}>
                  <Save className="size-4" /> Save preset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Preset name">
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="e.g. 750ml premium fill"
                  />
                </Field>
                <Field label="Description">
                  <Input
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="Short context shown in the dropdown"
                  />
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <NumField
                  label="Bottle weight (g)"
                  value={editing.values.bottleWeight}
                  onChange={(v) => setEditing({ ...editing, values: { ...editing.values, bottleWeight: v } })}
                />
                <NumField
                  label="Cap weight (g)"
                  value={editing.values.capWeight}
                  onChange={(v) => setEditing({ ...editing, values: { ...editing.values, capWeight: v } })}
                />
                <NumField
                  label="Liquid weight / 100ml"
                  value={editing.values.liquidWeightPer100ml}
                  onChange={(v) =>
                    setEditing({ ...editing, values: { ...editing.values, liquidWeightPer100ml: v } })
                  }
                />
                <NumField
                  label="Total weight (g)"
                  value={editing.values.totalWeightGrams}
                  onChange={(v) =>
                    setEditing({ ...editing, values: { ...editing.values, totalWeightGrams: v } })
                  }
                />
                <NumField
                  label="Minimum volume"
                  value={editing.values.minimumVolume}
                  onChange={(v) => setEditing({ ...editing, values: { ...editing.values, minimumVolume: v } })}
                />
                <NumField
                  label="Maximum volume"
                  value={editing.values.maximumVolume}
                  onChange={(v) => setEditing({ ...editing, values: { ...editing.values, maximumVolume: v } })}
                />
                <NumField
                  label="Boxes per pallet"
                  value={editing.values.boxesPerPallet}
                  onChange={(v) => setEditing({ ...editing, values: { ...editing.values, boxesPerPallet: v } })}
                />
                <NumField
                  label="Bottle count"
                  value={editing.values.bottleCount}
                  onChange={(v) => setEditing({ ...editing, values: { ...editing.values, bottleCount: v } })}
                />
                <Field label="M number">
                  <Input
                    value={editing.values.mNumber ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, values: { ...editing.values, mNumber: e.target.value } })
                    }
                    placeholder="M-…"
                  />
                </Field>
              </div>

              <Field label="Default notes">
                <Textarea
                  rows={3}
                  value={editing.values.notes ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, values: { ...editing.values, notes: e.target.value } })
                  }
                  placeholder="Optional notes pre-filled when this preset is loaded"
                />
              </Field>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Pallet rows</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const rows = editing.values.palletRowVolumes ?? [];
                        setEditing({
                          ...editing,
                          values: {
                            ...editing.values,
                            palletRowVolumes: [
                              ...rows,
                              { row: String(rows.length + 1), pump1: "", pump2: "" },
                            ],
                          },
                        });
                      }}
                    >
                      <Plus className="size-4" /> Add row
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {(editing.values.palletRowVolumes ?? []).map((r, i) => (
                    <div key={i} className="grid grid-cols-[60px_1fr_1fr_auto] gap-2 items-center">
                      <Input
                        value={r.row}
                        onChange={(e) => {
                          const rows = [...(editing.values.palletRowVolumes ?? [])];
                          rows[i] = { ...rows[i], row: e.target.value };
                          setEditing({ ...editing, values: { ...editing.values, palletRowVolumes: rows } });
                        }}
                      />
                      <Input
                        value={r.pump1}
                        placeholder="Pump 1 default"
                        onChange={(e) => {
                          const rows = [...(editing.values.palletRowVolumes ?? [])];
                          rows[i] = { ...rows[i], pump1: e.target.value };
                          setEditing({ ...editing, values: { ...editing.values, palletRowVolumes: rows } });
                        }}
                      />
                      <Input
                        value={r.pump2}
                        placeholder="Pump 2 default"
                        onChange={(e) => {
                          const rows = [...(editing.values.palletRowVolumes ?? [])];
                          rows[i] = { ...rows[i], pump2: e.target.value };
                          setEditing({ ...editing, values: { ...editing.values, palletRowVolumes: rows } });
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const rows = (editing.values.palletRowVolumes ?? []).filter((_, idx) => idx !== i);
                          setEditing({ ...editing, values: { ...editing.values, palletRowVolumes: rows } });
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function PresetCard({
  preset,
  readOnly,
  onEdit,
  onDelete,
}: {
  preset: QCPreset;
  readOnly?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="rounded-md border border-border p-3 space-y-2 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{preset.name}</div>
          <div className="text-xs text-muted-foreground line-clamp-2">{preset.description}</div>
        </div>
        {readOnly ? (
          <Badge variant="secondary" className="shrink-0">Built-in</Badge>
        ) : (
          <div className="flex gap-1 shrink-0">
            <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Edit">
              <Pencil className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete">
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground space-x-2">
        {preset.values.totalWeightGrams != null && <span>Total {preset.values.totalWeightGrams}g</span>}
        {preset.values.minimumVolume != null && preset.values.maximumVolume != null && (
          <span>
            {preset.values.minimumVolume}–{preset.values.maximumVolume}ml
          </span>
        )}
        {preset.values.bottleCount != null && <span>{preset.values.bottleCount} btls</span>}
      </div>
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

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : Number(v));
        }}
      />
    </Field>
  );
}
