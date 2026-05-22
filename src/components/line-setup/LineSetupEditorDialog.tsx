import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLineSetups, type LineSetupPreset } from "@/lib/line-setups";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";

interface Props {
  presetId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function blank(): Omit<LineSetupPreset, "id" | "createdAt" | "updatedAt"> {
  return {
    product: "",
    bottleSize: "500ml",
    line: "L1",
    fillVolumeMl: 500,
    fillNozzleHeightMm: 140,
    fillSpeedPct: 80,
    conveyorSpeedHz: 30,
    conveyorTensionPct: 70,
    capperTorqueNm: 2.5,
    capperHeadHeightMm: 220,
    labelOffsetMm: 12,
    labelTempC: 145,
    startDelayMs: 250,
    stopDelayMs: 180,
    sensorFillPositionMm: 80,
    sensorCapPositionMm: 110,
    sensorLabelPositionMm: 95,
    notes: "",
    favourite: false,
    successfulRuns: 0,
  };
}

export function LineSetupEditorDialog({ presetId, open, onOpenChange }: Props) {
  const { presets, add, update, remove } = useLineSetups();
  const { lines } = useStore();
  const { user, hasRole } = useAuth();
  const canDelete = hasRole("admin", "manager");

  const existing = presetId ? presets.find((p) => p.id === presetId) ?? null : null;
  const isEdit = !!existing;

  const [form, setForm] = useState(() => existing ?? blank());

  useEffect(() => {
    if (open) setForm(existing ?? blank());
  }, [open, existing]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const num = <K extends keyof typeof form>(k: K) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, Number(e.target.value) as (typeof form)[K]);

  function save() {
    if (!form.product.trim()) return;
    if (isEdit && existing) {
      update(existing.id, form);
    } else {
      add({ ...form, createdBy: user?.name });
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit line setup" : "New line setup"}</DialogTitle>
          <DialogDescription>
            Capture the machine values that produced a clean run so the next operator
            can reproduce it during changeover.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Product">
            <Input value={form.product} onChange={(e) => set("product", e.target.value)} />
          </Field>
          <Field label="Bottle size">
            <Input value={form.bottleSize} onChange={(e) => set("bottleSize", e.target.value)} />
          </Field>
          <Field label="Line">
            <Select value={form.line} onValueChange={(v) => set("line", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {lines.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Successful runs">
            <Input type="number" value={form.successfulRuns} onChange={num("successfulRuns")} />
          </Field>

          <Section title="Fill" />
          <Field label="Fill volume (ml)">
            <Input type="number" value={form.fillVolumeMl} onChange={num("fillVolumeMl")} />
          </Field>
          <Field label="Nozzle height (mm)">
            <Input type="number" value={form.fillNozzleHeightMm} onChange={num("fillNozzleHeightMm")} />
          </Field>
          <Field label="Fill speed (%)">
            <Input type="number" value={form.fillSpeedPct} onChange={num("fillSpeedPct")} />
          </Field>

          <Section title="Conveyor" />
          <Field label="Speed (Hz)">
            <Input type="number" value={form.conveyorSpeedHz} onChange={num("conveyorSpeedHz")} />
          </Field>
          <Field label="Tension (%)">
            <Input type="number" value={form.conveyorTensionPct} onChange={num("conveyorTensionPct")} />
          </Field>

          <Section title="Capper" />
          <Field label="Torque (Nm)">
            <Input type="number" step="0.1" value={form.capperTorqueNm} onChange={num("capperTorqueNm")} />
          </Field>
          <Field label="Head height (mm)">
            <Input type="number" value={form.capperHeadHeightMm} onChange={num("capperHeadHeightMm")} />
          </Field>

          <Section title="Label" />
          <Field label="Offset (mm)">
            <Input type="number" value={form.labelOffsetMm} onChange={num("labelOffsetMm")} />
          </Field>
          <Field label="Temperature (°C)">
            <Input type="number" value={form.labelTempC} onChange={num("labelTempC")} />
          </Field>

          <Section title="Delays" />
          <Field label="Start delay (ms)">
            <Input type="number" value={form.startDelayMs} onChange={num("startDelayMs")} />
          </Field>
          <Field label="Stop delay (ms)">
            <Input type="number" value={form.stopDelayMs} onChange={num("stopDelayMs")} />
          </Field>

          <Section title="Sensors" />
          <Field label="Fill position (mm)">
            <Input type="number" value={form.sensorFillPositionMm} onChange={num("sensorFillPositionMm")} />
          </Field>
          <Field label="Cap position (mm)">
            <Input type="number" value={form.sensorCapPositionMm} onChange={num("sensorCapPositionMm")} />
          </Field>
          <Field label="Label position (mm)">
            <Input type="number" value={form.sensorLabelPositionMm} onChange={num("sensorLabelPositionMm")} />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        <DialogFooter className="gap-2 sm:gap-2">
          {isEdit && existing && canDelete && (
            <Button
              variant="destructive"
              className="mr-auto"
              onClick={() => {
                if (confirm("Delete this setup preset?")) {
                  remove(existing.id);
                  onOpenChange(false);
                }
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>{isEdit ? "Save changes" : "Create setup"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function Section({ title }: { title: string }) {
  return (
    <div className="md:col-span-2 mt-2 -mb-1 text-xs uppercase tracking-widest text-muted-foreground border-b border-border pb-1">
      {title}
    </div>
  );
}
