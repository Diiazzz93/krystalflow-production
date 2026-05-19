import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import type { QCEntry } from "@/lib/types";
import { fmtDateTime, uid } from "@/lib/utils-domain";
import { CheckCircle2, XCircle, Upload, Plus, Trash2, Sparkles, ChevronDown } from "lucide-react";
import { SignaturePad } from "./SignaturePad";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QC_PRESETS, type QCPreset } from "@/lib/qc-presets";
import { toast } from "sonner";

const CHECKS = [
  ["fillLevel", "Fill level"],
  ["capTightness", "Cap tightness"],
  ["labelAlignment", "Label alignment"],
  ["batchCode", "Batch code verified"],
  ["leakCheck", "Leak check"],
  ["bottleCondition", "Bottle condition"],
] as const;

type CheckKey = (typeof CHECKS)[number][0];

interface Props {
  jobId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function QCDialog({ jobId, open, onOpenChange }: Props) {
  const { jobs, qc, addQC } = useStore();
  const job = jobs.find((j) => j.id === jobId);
  const history = useMemo(
    () =>
      qc
        .filter((q) => q.jobId === jobId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [qc, jobId],
  );

  const nextPallet = (job?.palletsCompleted ?? 0) + 1;

  const [palletNumber, setPalletNumber] = useState(nextPallet);
  const [checks, setChecks] = useState<Record<CheckKey, "Pass" | "Fail">>({
    fillLevel: "Pass",
    capTightness: "Pass",
    labelAlignment: "Pass",
    batchCode: "Pass",
    leakCheck: "Pass",
    bottleCondition: "Pass",
  });
  const [bottleCount, setBottleCount] = useState(1200);
  const [operatorName, setOperatorName] = useState(job?.operator ?? "");
  const [notes, setNotes] = useState("");

  // Log Sheet (JotForm parity)
  const [mNumber, setMNumber] = useState("");
  const [logDate, setLogDate] = useState(todayISO());
  const [bottleWeight, setBottleWeight] = useState<number | "">("");
  const [capWeight, setCapWeight] = useState<number | "">("");
  const [liquidWeightPer100ml, setLiquidWeightPer100ml] = useState<number | "">("");
  const [totalWeightGrams, setTotalWeightGrams] = useState<number | "">("");
  const [palletRowVolumes, setPalletRowVolumes] = useState<
    { row: string; pump1: string; pump2: string }[]
  >([{ row: "", pump1: "", pump2: "" }]);
  const [startTime, setStartTime] = useState(nowHHMM());
  const [finishTime, setFinishTime] = useState("");
  const [minimumVolume, setMinimumVolume] = useState<number | "">("");
  const [maximumVolume, setMaximumVolume] = useState<number | "">("");
  const [boxesPerPallet, setBoxesPerPallet] = useState<number | "">("");
  const [finishedProductFileName, setFinishedProductFileName] = useState("");
  const [finalProductPhotoName, setFinalProductPhotoName] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [supervisorSignatureDataUrl, setSupervisorSignatureDataUrl] = useState<string | undefined>();

  if (!job) return null;

  function toggle(k: CheckKey) {
    setChecks((c) => ({ ...c, [k]: c[k] === "Pass" ? "Fail" : "Pass" }));
  }

  function applyPreset(preset: QCPreset) {
    const v = preset.values;
    if (v.mNumber !== undefined) setMNumber(v.mNumber);
    if (v.bottleWeight !== undefined) setBottleWeight(v.bottleWeight);
    if (v.capWeight !== undefined) setCapWeight(v.capWeight);
    if (v.liquidWeightPer100ml !== undefined) setLiquidWeightPer100ml(v.liquidWeightPer100ml);
    if (v.totalWeightGrams !== undefined) setTotalWeightGrams(v.totalWeightGrams);
    if (v.minimumVolume !== undefined) setMinimumVolume(v.minimumVolume);
    if (v.maximumVolume !== undefined) setMaximumVolume(v.maximumVolume);
    if (v.boxesPerPallet !== undefined) setBoxesPerPallet(v.boxesPerPallet);
    if (v.bottleCount !== undefined) setBottleCount(v.bottleCount);
    if (v.palletRowVolumes) setPalletRowVolumes(v.palletRowVolumes.map((r) => ({ ...r })));
    if (v.notes !== undefined) setNotes(v.notes);
    toast.success(`Applied preset: ${preset.name}`);
  }

  function numOrUndef(v: number | "") {
    return v === "" ? undefined : Number(v);
  }

  function submit() {
    const result: "Pass" | "Fail" = Object.values(checks).some((v) => v === "Fail")
      ? "Fail"
      : "Pass";
    const entry: QCEntry = {
      id: uid(),
      jobId,
      palletNumber,
      ...checks,
      bottleCount,
      operatorName,
      supervisorSignoff: supervisorName,
      notes,
      timestamp: new Date().toISOString(),
      result,
      mNumber: mNumber || undefined,
      logDate,
      bottleWeight: numOrUndef(bottleWeight),
      capWeight: numOrUndef(capWeight),
      liquidWeightPer100ml: numOrUndef(liquidWeightPer100ml),
      totalWeightGrams: numOrUndef(totalWeightGrams),
      palletRowVolumes: palletRowVolumes.filter((r) => r.row || r.pump1 || r.pump2),
      startTime,
      finishTime: finishTime || undefined,
      minimumVolume: numOrUndef(minimumVolume),
      maximumVolume: numOrUndef(maximumVolume),
      boxesPerPallet: numOrUndef(boxesPerPallet),
      finishedProductFileName: finishedProductFileName || undefined,
      finalProductPhotoName: finalProductPhotoName || undefined,
      supervisorName: supervisorName || undefined,
      supervisorSignatureDataUrl,
    };
    addQC(entry);
    setPalletNumber((n) => n + 1);
    setNotes("");
    setSupervisorSignatureDataUrl(undefined);
    setFinishTime(nowHHMM());
    setPalletRowVolumes([{ row: "", pump1: "", pump2: "" }]);
    setChecks({
      fillLevel: "Pass",
      capTightness: "Pass",
      labelAlignment: "Pass",
      batchCode: "Pass",
      leakCheck: "Pass",
      bottleCondition: "Pass",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quality Control — {job.product}</DialogTitle>
          <DialogDescription>
            {job.customer} · SKU {job.sku} · {job.bottleSize}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">
                Save time — load a preset to pre-fill common fields.
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Sparkles className="size-4" /> Load preset
                    <ChevronDown className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Preset forms</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {QC_PRESETS.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.description}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Filling Line Log Sheet */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Filling line log sheet
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="M Number">
                  <Input value={mNumber} onChange={(e) => setMNumber(e.target.value)} placeholder="M-…" />
                </Field>
                <Field label="Date">
                  <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
                </Field>
                <Field label="Operator">
                  <Input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Bottle weight (g)">
                  <Input type="number" step="0.01" value={bottleWeight}
                    onChange={(e) => setBottleWeight(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
                <Field label="Cap weight (g)">
                  <Input type="number" step="0.01" value={capWeight}
                    onChange={(e) => setCapWeight(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
                <Field label="Liquid weight">
                  <Input type="number" step="0.01" value={liquidWeightPer100ml}
                    onChange={(e) => setLiquidWeightPer100ml(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
                <Field label="Total weight (g)">
                  <Input type="number" step="0.01" value={totalWeightGrams}
                    onChange={(e) => setTotalWeightGrams(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
              </div>
            </section>

            {/* Pallet details */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Pallet details
              </h3>

              <Field label="Pallet row volumes">
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs uppercase text-muted-foreground px-1">
                    <span>Row</span>
                    <span>Pump 1</span>
                    <span>Pump 2</span>
                    <span className="w-9" />
                  </div>
                  {palletRowVolumes.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                      <Input
                        value={r.row}
                        onChange={(e) =>
                          setPalletRowVolumes((rows) =>
                            rows.map((x, j) => (j === i ? { ...x, row: e.target.value } : x)),
                          )
                        }
                      />
                      <Input
                        value={r.pump1}
                        onChange={(e) =>
                          setPalletRowVolumes((rows) =>
                            rows.map((x, j) => (j === i ? { ...x, pump1: e.target.value } : x)),
                          )
                        }
                      />
                      <Input
                        value={r.pump2}
                        onChange={(e) =>
                          setPalletRowVolumes((rows) =>
                            rows.map((x, j) => (j === i ? { ...x, pump2: e.target.value } : x)),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9"
                        disabled={palletRowVolumes.length === 1}
                        onClick={() =>
                          setPalletRowVolumes((rows) => rows.filter((_, j) => j !== i))
                        }
                        aria-label="Remove row"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPalletRowVolumes((rows) => [...rows, { row: "", pump1: "", pump2: "" }])
                    }
                  >
                    <Plus className="size-4 mr-1" /> Add row
                  </Button>
                </div>
              </Field>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Start time">
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </Field>
                <Field label="Finish time">
                  <Input type="time" value={finishTime} onChange={(e) => setFinishTime(e.target.value)} />
                </Field>
                <Field label="Minimum volume">
                  <Input type="number" step="0.01" value={minimumVolume}
                    onChange={(e) => setMinimumVolume(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
                <Field label="Maximum volume">
                  <Input type="number" step="0.01" value={maximumVolume}
                    onChange={(e) => setMaximumVolume(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Pallet #">
                  <Input type="number" value={palletNumber}
                    onChange={(e) => setPalletNumber(Number(e.target.value))} />
                </Field>
                <Field label="Boxes per pallet">
                  <Input type="number" value={boxesPerPallet}
                    onChange={(e) => setBoxesPerPallet(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
                <Field label="Bottle count">
                  <Input type="number" value={bottleCount}
                    onChange={(e) => setBottleCount(Number(e.target.value))} />
                </Field>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FileField label="Finished product file" value={finishedProductFileName}
                  onChange={setFinishedProductFileName} />
                <FileField label="Final product photo" value={finalProductPhotoName}
                  onChange={setFinalProductPhotoName} accept="image/*" />
              </div>
            </section>

            {/* Pass / fail checks */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Inspection checks
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {CHECKS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                      checks[key] === "Pass"
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-red-500/40 bg-red-500/10"
                    }`}
                  >
                    <span className="font-medium">{label}</span>
                    {checks[key] === "Pass" ? (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                        <CheckCircle2 className="size-4" /> Pass
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-semibold">
                        <XCircle className="size-4" /> Fail
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* Sign off */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Sign off
              </h3>
              <Field label="Supervisor">
                <Input value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} />
              </Field>
              <Field label="Signature">
                <SignaturePad value={supervisorSignatureDataUrl} onChange={setSupervisorSignatureDataUrl} />
              </Field>
              <Field label="Notes">
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </section>

            <Button className="w-full" onClick={submit}>
              Submit QC log
            </Button>
          </div>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              QC history
            </h3>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No QC checks recorded yet.</p>
            ) : (
              <ol className="relative border-s border-border ms-3 space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="ms-4">
                    <span
                      className={`absolute -start-1.5 mt-1.5 size-3 rounded-full ${
                        h.result === "Pass" ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Pallet #{h.palletNumber}
                        {h.mNumber && <span className="text-muted-foreground"> · {h.mNumber}</span>}
                      </span>
                      <Badge className={h.result === "Pass" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}>
                        {h.result}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(h.timestamp)}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.operatorName} · {h.bottleCount} bottles
                      {h.startTime && ` · ${h.startTime}${h.finishTime ? `–${h.finishTime}` : ""}`}
                    </p>
                    {(h.minimumVolume !== undefined || h.maximumVolume !== undefined) && (
                      <p className="text-xs text-muted-foreground">
                        Volume {h.minimumVolume ?? "?"}–{h.maximumVolume ?? "?"}
                        {h.totalWeightGrams !== undefined && ` · ${h.totalWeightGrams}g`}
                      </p>
                    )}
                    {h.supervisorName && (
                      <p className="text-xs text-muted-foreground">Sign-off: {h.supervisorName}</p>
                    )}
                    {h.supervisorSignatureDataUrl && (
                      <img
                        src={h.supervisorSignatureDataUrl}
                        alt="Signature"
                        className="mt-1 h-10 rounded border border-border bg-background"
                      />
                    )}
                    {h.notes && <p className="text-xs mt-1">{h.notes}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function FileField({
  label,
  value,
  onChange,
  accept,
}: {
  label: string;
  value: string;
  onChange: (name: string) => void;
  accept?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      <label className="flex items-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm cursor-pointer hover:bg-accent/40">
        <Upload className="size-4 text-muted-foreground" />
        <span className="truncate text-muted-foreground">
          {value || "Choose a file"}
        </span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onChange(f.name);
          }}
        />
      </label>
    </div>
  );
}
