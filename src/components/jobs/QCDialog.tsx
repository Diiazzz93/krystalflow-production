import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import type { QCEntry } from "@/lib/types";
import { fmtDateTime, uid } from "@/lib/utils-domain";
import { CheckCircle2, XCircle, Upload, Plus, Trash2, Sparkles, ChevronDown } from "lucide-react";
import { SignaturePad } from "./SignaturePad";
import { PalletStickerDialog } from "./PalletStickerDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAllPresets, subscribeToPresets, type QCPreset } from "@/lib/qc-presets";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { createPalletAssembly } from "@/lib/unleashed/assembly.functions";



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
  /** When provided, pre-fills the form with the data from this QC entry (view/edit existing pallet). */
  prefillEntryId?: string | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function generatePalletCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `KS-${code}`;
}

export function QCDialog({ jobId, open, onOpenChange, prefillEntryId }: Props) {
  const { jobs, qc, addQC, updateQC, deleteQC } = useStore();
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  const job = jobs.find((j) => j.id === jobId);
  const history = useMemo(
    () =>
      qc
        .filter((q) => q.jobId === jobId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [qc, jobId],
  );

  const nextPallet = (job?.palletsCompleted ?? 0) + 1;
  const createAssembly = useServerFn(createPalletAssembly);

  // Default pallet quantity: original boxes/bottles ÷ original pallets.
  const defaultPalletQuantity = useMemo(() => {
    if (!job) return 0;
    const original = job.originalQuantity ?? job.quantity ?? 0;
    const pallets = job.originalPallets ?? job.pallets ?? 0;
    if (!pallets) return 0;
    return Math.round(original / pallets);
  }, [job]);


  const [presets, setPresets] = useState<QCPreset[]>(() => getAllPresets());
  useEffect(() => {
    if (!open) return;
    setPresets(getAllPresets());
    return subscribeToPresets(() => setPresets(getAllPresets()));
  }, [open]);

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
  const [palletQuantity, setPalletQuantity] = useState<number | "">("");
  const [palletType, setPalletType] = useState<"CHEP" | "Recochem" | "Plain">("CHEP");
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
  const [fillOperator, setFillOperator] = useState("");
  const [bottleQcOperator, setBottleQcOperator] = useState("");
  const [capperOperator, setCapperOperator] = useState("");
  const [packagingOperator, setPackagingOperator] = useState("");
  const [lastSubmittedId, setLastSubmittedId] = useState<string | null>(null);
  const [stickerEntry, setStickerEntry] = useState<QCEntry | null>(null);
  const historyListRef = useRef<HTMLOListElement>(null);
  const hydratedRef = useRef(false);
  const draftKey = `qc-draft:${jobId}`;

  // Clear highlight after 2.5s
  useEffect(() => {
    if (!lastSubmittedId) return;
    const t = setTimeout(() => setLastSubmittedId(null), 2500);
    return () => clearTimeout(t);
  }, [lastSubmittedId]);

  // Restore unsaved draft (e.g. after iOS WebView reload from camera).
  useEffect(() => {
    if (!open || hydratedRef.current || prefillEntryId) return;
    hydratedRef.current = true;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.editingEntryId) setEditingEntryId(s.editingEntryId);
      if (s.palletNumber != null) setPalletNumber(s.palletNumber);
      if (s.checks) setChecks(s.checks);
      if (s.bottleCount != null) setBottleCount(s.bottleCount);
      if (s.palletQuantity !== undefined) setPalletQuantity(s.palletQuantity);
      if (s.palletType) setPalletType(s.palletType);
      if (s.operatorName != null) setOperatorName(s.operatorName);
      if (s.notes != null) setNotes(s.notes);
      if (s.mNumber != null) setMNumber(s.mNumber);
      if (s.logDate) setLogDate(s.logDate);
      if (s.bottleWeight !== undefined) setBottleWeight(s.bottleWeight);
      if (s.capWeight !== undefined) setCapWeight(s.capWeight);
      if (s.liquidWeightPer100ml !== undefined) setLiquidWeightPer100ml(s.liquidWeightPer100ml);
      if (s.totalWeightGrams !== undefined) setTotalWeightGrams(s.totalWeightGrams);
      if (s.palletRowVolumes) setPalletRowVolumes(s.palletRowVolumes);
      if (s.startTime) setStartTime(s.startTime);
      if (s.finishTime != null) setFinishTime(s.finishTime);
      if (s.minimumVolume !== undefined) setMinimumVolume(s.minimumVolume);
      if (s.maximumVolume !== undefined) setMaximumVolume(s.maximumVolume);
      if (s.boxesPerPallet !== undefined) setBoxesPerPallet(s.boxesPerPallet);
      if (s.finishedProductFileName != null) setFinishedProductFileName(s.finishedProductFileName);
      if (s.finalProductPhotoName != null) setFinalProductPhotoName(s.finalProductPhotoName);
      if (s.supervisorName != null) setSupervisorName(s.supervisorName);
      if (s.supervisorSignatureDataUrl) setSupervisorSignatureDataUrl(s.supervisorSignatureDataUrl);
      if (s.fillOperator != null) setFillOperator(s.fillOperator);
      if (s.bottleQcOperator != null) setBottleQcOperator(s.bottleQcOperator);
      if (s.capperOperator != null) setCapperOperator(s.capperOperator);
      if (s.packagingOperator != null) setPackagingOperator(s.packagingOperator);
      toast.info("Restored unsaved QC draft");
    } catch {
      /* ignore */
    }
  }, [open, prefillEntryId, draftKey]);

  // Persist draft on every change so a WebView reload doesn't lose progress.
  useEffect(() => {
    if (!open || !hydratedRef.current) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          editingEntryId, palletNumber, checks, bottleCount, palletQuantity, palletType,
          operatorName, notes, mNumber, logDate, bottleWeight, capWeight,
          liquidWeightPer100ml, totalWeightGrams, palletRowVolumes, startTime,
          finishTime, minimumVolume, maximumVolume, boxesPerPallet,
          finishedProductFileName, finalProductPhotoName, supervisorName,
          supervisorSignatureDataUrl, fillOperator, bottleQcOperator,
          capperOperator, packagingOperator,
        }),
      );
    } catch {
      /* quota — ignore */
    }
  }, [open, draftKey, editingEntryId, palletNumber, checks, bottleCount,
      palletQuantity, palletType, operatorName, notes, mNumber, logDate, bottleWeight,
      capWeight, liquidWeightPer100ml, totalWeightGrams, palletRowVolumes,
      startTime, finishTime, minimumVolume, maximumVolume, boxesPerPallet,
      finishedProductFileName, finalProductPhotoName, supervisorName,
      supervisorSignatureDataUrl, fillOperator, bottleQcOperator,
      capperOperator, packagingOperator]);

  const clearDraft = () => {
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
  };


  const loadFromEntry = (e: QCEntry) => {
    setEditingEntryId(e.id);
    setPalletNumber(e.palletNumber);
    setChecks({
      fillLevel: e.fillLevel,
      capTightness: e.capTightness,
      labelAlignment: e.labelAlignment,
      batchCode: e.batchCode,
      leakCheck: e.leakCheck,
      bottleCondition: e.bottleCondition,
    });
    setBottleCount(e.bottleCount);
    setPalletQuantity(e.palletQuantity ?? "");
    setPalletType(e.palletType ?? "CHEP");
    setOperatorName(e.operatorName ?? "");
    setNotes(e.notes ?? "");
    setMNumber(e.mNumber ?? "");
    setLogDate(e.logDate ?? todayISO());
    setBottleWeight(e.bottleWeight ?? "");
    setCapWeight(e.capWeight ?? "");
    setLiquidWeightPer100ml(e.liquidWeightPer100ml ?? "");
    setTotalWeightGrams(e.totalWeightGrams ?? "");
    setPalletRowVolumes(
      e.palletRowVolumes && e.palletRowVolumes.length > 0
        ? e.palletRowVolumes.map((r) => ({ ...r }))
        : [{ row: "", pump1: "", pump2: "" }],
    );
    setStartTime(e.startTime ?? "");
    setFinishTime(e.finishTime ?? "");
    setMinimumVolume(e.minimumVolume ?? "");
    setMaximumVolume(e.maximumVolume ?? "");
    setBoxesPerPallet(e.boxesPerPallet ?? "");
    setFinishedProductFileName(e.finishedProductFileName ?? "");
    setFinalProductPhotoName(e.finalProductPhotoName ?? "");
    setSupervisorName(e.supervisorName ?? e.supervisorSignoff ?? "");
    setSupervisorSignatureDataUrl(e.supervisorSignatureDataUrl);
    setFillOperator(e.fillOperator ?? "");
    setBottleQcOperator(e.bottleQcOperator ?? "");
    setCapperOperator(e.capperOperator ?? "");
    setPackagingOperator(e.packagingOperator ?? "");
  };

  const resetForNew = () => {
    setEditingEntryId(null);
    setPalletNumber(nextPallet);
    setPalletQuantity("");
    setNotes("");
    setSupervisorSignatureDataUrl(undefined);
    setPalletRowVolumes([{ row: "", pump1: "", pump2: "" }]);
    setFillOperator("");
    setBottleQcOperator("");
    setCapperOperator("");
    setPackagingOperator("");
    setChecks({
      fillLevel: "Pass",
      capTightness: "Pass",
      labelAlignment: "Pass",
      batchCode: "Pass",
      leakCheck: "Pass",
      bottleCondition: "Pass",
    });
  };

  // Prefill form from an existing entry (look-up by pallet code flow)
  useEffect(() => {
    if (!open || !prefillEntryId) return;
    const e = qc.find((q) => q.id === prefillEntryId);
    if (!e) return;
    loadFromEntry(e);
    toast.info(`Loaded pallet #${e.palletNumber}`, {
      description: e.palletCode ? `Code ${e.palletCode}` : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillEntryId, qc]);

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

  async function submit() {
    const result: "Pass" | "Fail" = Object.values(checks).some((v) => v === "Fail")
      ? "Fail"
      : "Pass";
    const existing = editingEntryId ? qc.find((q) => q.id === editingEntryId) : null;
    const isEditing = !!existing;
    // Preserve the original pallet code and id when editing — codes are permanent.
    const palletCode = existing?.palletCode ?? generatePalletCode();
    const entryId = existing?.id ?? (globalThis.crypto?.randomUUID?.() ?? uid());
    const effectivePalletQuantity =
      palletQuantity !== "" && Number(palletQuantity) > 0
        ? Number(palletQuantity)
        : defaultPalletQuantity;
    const entry: QCEntry = {
      id: entryId,
      jobId,
      palletNumber,
      ...checks,
      bottleCount,
      operatorName,
      supervisorSignoff: supervisorName,
      notes,
      timestamp: existing?.timestamp ?? new Date().toISOString(),
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
      fillOperator: fillOperator || undefined,
      bottleQcOperator: bottleQcOperator || undefined,
      capperOperator: capperOperator || undefined,
      packagingOperator: packagingOperator || undefined,
      palletCode,
      palletQuantity: effectivePalletQuantity || undefined,
      palletType,
      qcApproved: result === "Pass" && !!supervisorSignatureDataUrl,
    };

    if (isEditing) {
      await updateQC(entry.id, entry);
      setLastSubmittedId(entry.id);
      clearDraft();
      toast.success(`Pallet #${entry.palletNumber} updated · ${entry.result}`, {
        description: `Code ${palletCode} — record updated.`,
      });
      requestAnimationFrame(() => {
        historyListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      });
      return;
    }


    await addQC(entry);
    setLastSubmittedId(entry.id);
    setStickerEntry(entry);
    toast.success(
      `Pallet #${entry.palletNumber} logged · ${entry.result}`,
      { description: `Code ${palletCode} — sticker ready to print.` },
    );

    // On Pass, create the per-pallet Assembly in Unleashed. Non-blocking:
    // failures show a toast but never break the QC flow.
    if (result === "Pass" && job?.unleashedSalesOrderNumber && effectivePalletQuantity > 0) {
      createAssembly({
        data: {
          jobId,
          palletQuantity: effectivePalletQuantity,
          palletCode,
          autoComplete: false,
        },
      })
        .then((res) => {
          if (res.assemblyNumber) {
            toast.success(`Unleashed Assembly ${res.assemblyNumber} created`, {
              description: `Pallet ${palletCode} · ${effectivePalletQuantity} units`,
            });
          }
        })
        .catch((e: unknown) => {
          toast.error("Unleashed Assembly not created", {
            description: e instanceof Error ? e.message : String(e),
          });
        });
    }

    // Scroll history to top so the new entry is visible
    requestAnimationFrame(() => {
      historyListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
    setPalletNumber((n) => n + 1);
    setFinishTime(nowHHMM());
    clearDraft();
    resetForNew();
  }




  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) clearDraft(); onOpenChange(v); }}>
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
                  {presets.length === 0 && (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      No presets yet. Create some under Settings → QC presets.
                    </div>
                  )}
                  {presets.map((p) => (
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

              {/* Production progress: how many boxes/units this pallet adds to Completed. */}
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
                <Field label={`Units produced on this pallet (defaults to ${defaultPalletQuantity.toLocaleString()})`}>
                  <Input
                    type="number"
                    value={palletQuantity}
                    placeholder={String(defaultPalletQuantity || "")}
                    onChange={(e) => setPalletQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </Field>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Pass + supervisor signature increments the job's Completed total and creates an Unleashed Assembly for this pallet only.
                </p>
              </div>


              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FileField label="Finished pallet photo" value={finishedProductFileName}
                  onChange={setFinishedProductFileName} accept="image/*" />
                <FileField label="Final product photo" value={finalProductPhotoName}
                  onChange={setFinalProductPhotoName} accept="image/*" />
              </div>
            </section>

            {/* Section operators */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Section operators
              </h3>
              <p className="text-xs text-muted-foreground -mt-2">
                Record who was in charge of each line section so issues can be traced quickly.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Fill">
                  <Input value={fillOperator} onChange={(e) => setFillOperator(e.target.value)} placeholder="Name" />
                </Field>
                <Field label="Bottle / QC">
                  <Input value={bottleQcOperator} onChange={(e) => setBottleQcOperator(e.target.value)} placeholder="Name" />
                </Field>
                <Field label="Capper">
                  <Input value={capperOperator} onChange={(e) => setCapperOperator(e.target.value)} placeholder="Name" />
                </Field>
                <Field label="Packaging">
                  <Input value={packagingOperator} onChange={(e) => setPackagingOperator(e.target.value)} placeholder="Name" />
                </Field>
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

            {editingEntryId && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                <span className="text-amber-700 dark:text-amber-300">
                  Editing saved pallet · code stays the same
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setEntryToDelete(editingEntryId)}
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={resetForNew}>
                    New entry
                  </Button>
                </div>
              </div>
            )}

            <Button className="w-full" onClick={submit}>
              {editingEntryId ? "Save changes" : "Submit QC log"}
            </Button>
          </div>

          <section className="space-y-3 lg:sticky lg:top-0 lg:self-start lg:max-h-[80vh] lg:flex lg:flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                QC history
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {history.length} {history.length === 1 ? "entry" : "entries"}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  Live
                </span>
              </div>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No QC checks recorded yet.</p>
            ) : (
              <ol ref={historyListRef} className="relative border-s border-border ms-3 space-y-3 lg:overflow-y-auto lg:pr-2 lg:flex-1">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className={`ms-4 rounded-md transition-all duration-500 ${
                      h.id === lastSubmittedId
                        ? "bg-emerald-500/10 ring-1 ring-emerald-500/40 p-2 -m-2"
                        : h.id === editingEntryId
                        ? "bg-amber-500/10 ring-1 ring-amber-500/40 p-2 -m-2"
                        : ""
                    }`}
                  >
                    <span
                      className={`absolute -start-1.5 mt-1.5 size-3 rounded-full ${
                        h.result === "Pass" ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        loadFromEntry(h);
                        toast.info(`Loaded pallet #${h.palletNumber}`, {
                          description: h.palletCode ? `Code ${h.palletCode}` : undefined,
                        });
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          loadFromEntry(h);
                        }
                      }}
                      className="cursor-pointer rounded-md -mx-1 px-1 py-0.5 hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Pallet #{h.palletNumber}
                          {h.mNumber && <span className="text-muted-foreground"> · {h.mNumber}</span>}
                        </span>
                        <Badge className={h.result === "Pass" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}>
                          {h.result}
                        </Badge>
                      </div>
                    </div>
                    {h.palletCode && (
                      <div className="mt-1 flex items-center justify-between gap-2 rounded border border-dashed border-border bg-muted/40 px-2 py-1">
                        <code className="text-[10px] font-mono tracking-wide">{h.palletCode}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setStickerEntry(h);
                          }}
                        >
                          Reprint
                        </Button>
                      </div>
                    )}
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
                    {(h.fillOperator || h.bottleQcOperator || h.capperOperator || h.packagingOperator) && (
                      <p className="text-xs text-muted-foreground">
                        {[
                          h.fillOperator && `Fill: ${h.fillOperator}`,
                          h.bottleQcOperator && `Bottle/QC: ${h.bottleQcOperator}`,
                          h.capperOperator && `Capper: ${h.capperOperator}`,
                          h.packagingOperator && `Packaging: ${h.packagingOperator}`,
                        ].filter(Boolean).join(" · ")}
                      </p>
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
          <Button variant="outline" onClick={() => { clearDraft(); onOpenChange(false); }}>Close</Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog
        open={!!entryToDelete}
        onOpenChange={(v) => !v && setEntryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete QC record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove pallet #{history.find((h) => h.id === entryToDelete)?.palletNumber}.
              The pallet code will no longer be lookupable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEntryToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!entryToDelete) return;
                await deleteQC(entryToDelete);
                setEntryToDelete(null);
                resetForNew();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {stickerEntry && (
        <PalletStickerDialog
          open={!!stickerEntry}
          onOpenChange={(v) => !v && setStickerEntry(null)}
          entry={stickerEntry}
          job={job}
        />
      )}
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
