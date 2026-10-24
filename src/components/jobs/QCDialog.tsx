import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import type { QCEntry } from "@/lib/types";
import { fmtDateTime, uid } from "@/lib/utils-domain";
import { CheckCircle2, XCircle, Upload, Plus, Trash2, Sparkles, ChevronDown, Save, Clock } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import { createPalletAssembly } from "@/lib/unleashed/assembly.functions";
import { getPackConfig, computeAssemblyQuantity } from "@/lib/pack-config";
import { EMPTY_QC_CHECKS, validateQCForm } from "@/lib/qc-validation";
import { usePartPallets, type PartPallet, type PartPalletValues } from "@/lib/qc-part-pallets";




const CHECKS = [
  ["fillLevel", "Fill level"],
  ["capTightness", "Cap tightness"],
  ["labelAlignment", "Label alignment"],
  ["batchCode", "Batch code verified"],
  ["leakCheck", "Leak check"],
  ["bottleCondition", "Bottle condition"],
] as const;

type CheckKey = (typeof CHECKS)[number][0];
const ValidationContext = createContext<Record<string, string>>({});

/** Sentinel job id used for QC forms that aren't tied to a production job. */
export const STANDALONE_QC_JOB_ID = "standalone";

interface Props {
  jobId?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When provided, pre-fills the form with the data from this QC entry (view/edit existing pallet). */
  prefillEntryId?: string | null;
  partPalletId?: string | null;
  /** Blank QC form not linked to any job. No Unleashed assembly unless explicitly opted in. */
  standalone?: boolean;
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

export function QCDialog({ jobId, open, onOpenChange, prefillEntryId, partPalletId, standalone = false }: Props) {
  const { jobs, qc, addQC, updateQC, deleteQC } = useStore();
  const { can } = useAuth();
  const canWriteQc = can("qc:complete");
  const { partPallets, savePartPallet, refresh: refreshParts } = usePartPallets();
  const [partPallet, setPartPallet] = useState<PartPallet | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const loadedPartRef = useRef<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  // Standalone mode: blank form, optional job link, opt-in Unleashed assembly.
  const [linkedJobId, setLinkedJobId] = useState("");
  const [title, setTitle] = useState("");
  const [wantAssembly, setWantAssembly] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [missingDetailsOpen, setMissingDetailsOpen] = useState(false);

  const effectiveJobId = standalone ? linkedJobId : (jobId ?? "");
  const entryJobId = effectiveJobId || STANDALONE_QC_JOB_ID;

  const job = jobs.find((j) => j.id === effectiveJobId);
  const history = useMemo(
    () => {
      const runStartedAt = Date.parse(job?.importedFromUnleashedAt ?? "");
      return qc
        .filter((q) => {
          if (q.jobId !== entryJobId) return false;
          if (!Number.isFinite(runStartedAt)) return true;
          const timestamp = Date.parse(q.timestamp);
          return !Number.isFinite(timestamp) || timestamp >= runStartedAt - 1000;
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    [qc, entryJobId, job?.importedFromUnleashedAt],
  );

  const nextPallet = (job?.palletsCompleted ?? 0) + 1;
  const createAssembly = useServerFn(createPalletAssembly);

  const packConfig = useMemo(
    () =>
      getPackConfig(
        job ?? { sku: "", product: "", bottleSize: "", bottlesPerCarton: undefined },
      ),
    [job],
  );

  /** Pending Unleashed assembly awaiting operator confirmation. */
  const [pendingAssembly, setPendingAssembly] = useState<{
    palletCode: string;
    unitsProduced: number;
  } | null>(null);
  const [assemblyBusy, setAssemblyBusy] = useState(false);

  // Default pallet quantity: original boxes/bottles ÷ original pallets.
  const defaultPalletQuantity = useMemo(() => {
    if (!job) return 0;
    const original = job.originalQuantity ?? job.quantity ?? 0;
    const pallets = Math.max(job.originalPallets ?? 0, job.pallets ?? 0);
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
  const [checks, setChecks] = useState({ ...EMPTY_QC_CHECKS });
  const [bottleCount, setBottleCount] = useState<number | "">("");
  const [palletQuantity, setPalletQuantity] = useState<number | "">("");
  const previewQty = useMemo(
    () =>
      computeAssemblyQuantity(
        palletQuantity !== "" && Number(palletQuantity) > 0
          ? Number(palletQuantity)
          : defaultPalletQuantity,
        packConfig.unitsPerFinished,
      ),
    [palletQuantity, defaultPalletQuantity, packConfig.unitsPerFinished],
  );

  const [palletType, setPalletType] = useState<"CHEP" | "Recochem" | "Plain" | "">("");
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
  const draftKey = `qc-draft:${standalone ? "standalone" : jobId}`;

  // Clear highlight after 2.5s
  useEffect(() => {
    if (!lastSubmittedId) return;
    const t = setTimeout(() => setLastSubmittedId(null), 2500);
    return () => clearTimeout(t);
  }, [lastSubmittedId]);

  // Restore unsaved draft (e.g. after iOS WebView reload from camera).
  useEffect(() => {
    if (!open || hydratedRef.current || prefillEntryId || partPalletId) return;
    hydratedRef.current = true;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.partPallet) setPartPallet(s.partPallet);
      if (s.linkedJobId != null) setLinkedJobId(s.linkedJobId);
      if (s.wantAssembly != null) setWantAssembly(s.wantAssembly);
      if (s.title != null) setTitle(s.title);
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
  }, [open, prefillEntryId, partPalletId, draftKey]);

  // Persist draft on every change so a WebView reload doesn't lose progress.
  useEffect(() => {
    if (!open || !hydratedRef.current) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          partPallet, linkedJobId, wantAssembly, title, editingEntryId, palletNumber, checks, bottleCount, palletQuantity, palletType,
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
  }, [open, draftKey, partPallet, linkedJobId, wantAssembly, title, editingEntryId, palletNumber, checks, bottleCount,
      palletQuantity, palletType, operatorName, notes, mNumber, logDate, bottleWeight,
      capWeight, liquidWeightPer100ml, totalWeightGrams, palletRowVolumes,
      startTime, finishTime, minimumVolume, maximumVolume, boxesPerPallet,
      finishedProductFileName, finalProductPhotoName, supervisorName,
      supervisorSignatureDataUrl, fillOperator, bottleQcOperator,
      capperOperator, packagingOperator]);

  useEffect(() => {
    if (!open || !partPalletId || loadedPartRef.current === partPalletId) return;
    const saved = partPallets.find(p => p.id === partPalletId);
    if (!saved) return;
    loadedPartRef.current = saved.id;
    hydratedRef.current = true;
    setPartPallet(saved);
    setEditingEntryId(null);
    const v = saved.values;
    setTitle(v.title);
    setPalletNumber(v.palletNumber);
    setChecks(v.checks);
    setBottleCount(v.bottleCount);
    setPalletQuantity(v.palletQuantity);
    setPalletType(v.palletType);
    setOperatorName(v.operatorName);
    setNotes(v.notes);
    setMNumber(v.mNumber);
    setLogDate(v.logDate);
    setBottleWeight(v.bottleWeight);
    setCapWeight(v.capWeight);
    setLiquidWeightPer100ml(v.liquidWeightPer100ml);
    setTotalWeightGrams(v.totalWeightGrams);
    setPalletRowVolumes(v.palletRowVolumes);
    setStartTime(v.startTime);
    setFinishTime(v.finishTime);
    setMinimumVolume(v.minimumVolume);
    setMaximumVolume(v.maximumVolume);
    setBoxesPerPallet(v.boxesPerPallet);
    setFinishedProductFileName(v.finishedProductFileName);
    setFinalProductPhotoName(v.finalProductPhotoName);
    setSupervisorName(v.supervisorName);
    setSupervisorSignatureDataUrl(v.supervisorSignatureDataUrl);
    setFillOperator(v.fillOperator);
    setBottleQcOperator(v.bottleQcOperator);
    setCapperOperator(v.capperOperator);
    setPackagingOperator(v.packagingOperator);
    setLinkedJobId(v.linkedJobId);
    setWantAssembly(v.wantAssembly);
    setValidationErrors({});
  }, [open, partPalletId, partPallets]);

  function currentPartValues(): PartPalletValues {
    return {
      standalone, title, mNumber, logDate, operatorName, bottleWeight, capWeight,
      liquidWeightPer100ml, totalWeightGrams, palletRowVolumes, startTime, finishTime,
      minimumVolume, maximumVolume, palletNumber, boxesPerPallet, bottleCount,
      palletQuantity, palletType, bottleQcOperator, capperOperator, packagingOperator,
      checks, supervisorName, supervisorSignatureDataUrl, notes, fillOperator,
      finishedProductFileName, finalProductPhotoName,
      linkedJobId: effectiveJobId, wantAssembly,
    };
  }

  async function saveUnfinished() {
    if (saveBusy || editingEntryId) return;
    setSaveBusy(true);
    try {
      await savePartPallet(currentPartValues(), partPallet);
      clearDraft();
      toast.success(`Part pallet #${palletNumber} saved`, { description: "Reopen it from Part pallets when ready to finish." });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save part pallet. Keep this form open and retry.");
    } finally { setSaveBusy(false); }
  }

  const clearDraft = () => {
    try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
  };


  const loadFromEntry = (e: QCEntry) => {
    setValidationErrors({});
    setPartPallet(null);
    setEditingEntryId(e.id);
    setTitle(e.title ?? "");
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
    setPartPallet(null);
    if (standalone) setTitle("");
    setPalletNumber(nextPallet);
    setPalletQuantity("");
    setNotes("");
    setSupervisorSignatureDataUrl(undefined);
    setPalletRowVolumes([{ row: "", pump1: "", pump2: "" }]);
    setFillOperator("");
    setBottleQcOperator("");
    setCapperOperator("");
    setPackagingOperator("");
    setChecks({ ...EMPTY_QC_CHECKS });
    setBottleCount("");
    setPalletType("");
    setOperatorName(job?.operator ?? "");
    setMNumber("");
    setLogDate(todayISO());
    setBottleWeight("");
    setCapWeight("");
    setLiquidWeightPer100ml("");
    setTotalWeightGrams("");
    setStartTime(nowHHMM());
    setFinishTime("");
    setMinimumVolume("");
    setMaximumVolume("");
    setBoxesPerPallet("");
    setSupervisorName("");
    setFinishedProductFileName("");
    setFinalProductPhotoName("");
    setValidationErrors({});
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

  if (!job && !standalone) return null;



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
    if (!canWriteQc) {
      toast.error("Only admins and managers can save QC records");
      return;
    }
    const errors = validateQCForm({
      standalone, title, mNumber, logDate, operatorName, bottleWeight, capWeight,
      liquidWeightPer100ml, totalWeightGrams, palletRowVolumes, startTime, finishTime,
      minimumVolume, maximumVolume, palletNumber, boxesPerPallet, bottleCount,
      palletQuantity, palletType, bottleQcOperator, capperOperator, packagingOperator,
      checks, supervisorName, supervisorSignatureDataUrl, notes,
    });
    setValidationErrors(errors);
    if (Object.keys(errors).length) {
      setMissingDetailsOpen(true);
      return;
    }
    const result: "Pass" | "Fail" = Object.values(checks).some((v) => v === "Fail")
      ? "Fail"
      : "Pass";
    const existing = editingEntryId ? qc.find((q) => q.id === editingEntryId) : null;
    const isEditing = !!existing;
    // Preserve the original pallet code and id when editing — codes are permanent.
    const palletCode = existing?.palletCode ?? generatePalletCode();
    const entryId = existing?.id ?? partPallet?.id ?? (globalThis.crypto?.randomUUID?.() ?? uid());
    const effectivePalletQuantity =
      palletQuantity !== "" && Number(palletQuantity) > 0
        ? Number(palletQuantity)
        : defaultPalletQuantity;
    const entry: QCEntry = {
      id: entryId,
      jobId: entryJobId,
      title: title || undefined,
      palletNumber,
      fillLevel: checks.fillLevel === "Fail" ? "Fail" : "Pass",
      capTightness: checks.capTightness === "Fail" ? "Fail" : "Pass",
      labelAlignment: checks.labelAlignment === "Fail" ? "Fail" : "Pass",
      batchCode: checks.batchCode === "Fail" ? "Fail" : "Pass",
      leakCheck: checks.leakCheck === "Fail" ? "Fail" : "Pass",
      bottleCondition: checks.bottleCondition === "Fail" ? "Fail" : "Pass",
      bottleCount: Number(bottleCount),
      operatorName,
      supervisorSignoff: supervisorName,
      notes,
      timestamp: existing?.timestamp ?? new Date().toISOString(),
      result,
      mNumber: mNumber.trim(),
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
      palletType: palletType === "" ? undefined : palletType,
      qcApproved: result === "Pass" && !!supervisorSignatureDataUrl,
    };

    if (isEditing) {
      const updated = await updateQC(entry.id, entry);
      if (!updated) return;
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


    const saved = await addQC(entry, partPallet ? { id: partPallet.id, updatedAt: partPallet.updatedAt } : undefined);
    if (!saved) return;
    if (partPallet) void refreshParts().catch(console.error);
    setLastSubmittedId(entry.id);
    setStickerEntry(entry);
    toast.success(
      `Pallet #${entry.palletNumber} logged · ${entry.result}`,
      { description: `Code ${palletCode} — sticker ready to print.` },
    );

    // On Pass, ask for confirmation before creating the per-pallet Assembly in
    // Unleashed. Standalone forms only do this when the operator opted in and
    // linked the check to a job.
    const assemblyAllowed = standalone ? wantAssembly && !!effectiveJobId : true;
    if (assemblyAllowed && result === "Pass" && job?.unleashedSalesOrderNumber && effectivePalletQuantity > 0) {
      setPendingAssembly({ palletCode, unitsProduced: effectivePalletQuantity });
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

  async function confirmAssembly() {
    if (!pendingAssembly) return;
    const calc = computeAssemblyQuantity(pendingAssembly.unitsProduced, packConfig.unitsPerFinished);
    if (!calc.exact) return;
    setAssemblyBusy(true);
    try {
      const res = await createAssembly({
        data: {
          jobId: effectiveJobId,
          palletQuantity: pendingAssembly.unitsProduced,
          unitsPerFinished: packConfig.unitsPerFinished,
          palletCode: pendingAssembly.palletCode,
          autoComplete: false,
        },
      });
      toast.success(
        res.assemblyNumber ? `Unleashed Assembly ${res.assemblyNumber} created` : "Unleashed Assembly created",
        {
          description: `Pallet ${pendingAssembly.palletCode} · ${calc.finishedQuantity.toLocaleString()} ${packConfig.finishedUnit.toLowerCase()}s`,
        },
      );
      setPendingAssembly(null);
    } catch (e) {
      toast.error("Unleashed Assembly not created", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setAssemblyBusy(false);
    }
  }





  return (
    <ValidationContext.Provider value={validationErrors}>
    <Dialog open={open} onOpenChange={(v) => { if (!v) clearDraft(); onOpenChange(v); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Quality Control — {job ? job.product : title || "New QC check"}
          </DialogTitle>
          <DialogDescription>
            {job
              ? `${job.customer} · SKU ${job.sku} · ${job.bottleSize}`
              : "Blank QC form — not linked to any job."}
          </DialogDescription>
        </DialogHeader>

        {partPallet && <Badge variant="outline"><Clock className="size-3 mr-1" />Part pallet #{partPallet.palletNumber}</Badge>}

        {standalone && (
          <section className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
            <Field label="What is this QC check for?">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bottle inspection — incoming stock"
              />
            </Field>
            <Field label="Link to a job (optional)">
              <Select
                disabled={!!partPallet}
                value={linkedJobId || "none"}
                onValueChange={(v) => {
                  setLinkedJobId(v === "none" ? "" : v);
                  if (v === "none") setWantAssembly(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked to a job</SelectItem>
                  {jobs
                    .filter((j) => j.status !== "Complete")
                    .map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.customer} — {j.product}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <button
              type="button"
              disabled={!linkedJobId}
              onClick={() => setWantAssembly((v) => !v)}
              className={cn(
                "w-full rounded-md border px-3 py-2.5 text-sm font-medium transition-colors",
                wantAssembly
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-accent/40",
                !linkedJobId && "opacity-50 cursor-not-allowed",
              )}
            >
              {wantAssembly
                ? "Will create an Unleashed assembly on pass"
                : "Do not create an Unleashed assembly"}
            </button>
            <p className="text-[11px] text-muted-foreground">
              Standalone checks never touch Unleashed unless you link a job and switch this on.
            </p>
          </section>
        )}

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
                  <Input value={mNumber} onChange={(e) => setMNumber(e.target.value)} placeholder="M number or . if not applicable" />
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
                    onChange={(e) => setBottleCount(e.target.value === "" ? "" : Number(e.target.value))} />
                </Field>
              </div>

              <Field label="Pallet type">
                <div className="grid grid-cols-3 gap-2">
                  {(["CHEP", "Recochem", "Plain"] as const).map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setPalletType(t)}
                      className={cn(
                        "rounded-md border px-3 py-2.5 text-sm font-medium transition-colors",
                        palletType === t
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-accent/40",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>



              {/* Production progress: how many boxes/units this pallet adds to Completed. */}
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
                <Field label="Units produced on this pallet">
                  <Input
                    type="number"
                    value={palletQuantity}
                    placeholder={String(defaultPalletQuantity || "")}
                    onChange={(e) => setPalletQuantity(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </Field>
                {packConfig.unitsPerFinished > 1 && (
                  <div className="mt-2 space-y-0.5 text-[11px]">
                    <div className="text-muted-foreground">
                      Individual bottles produced: <strong className="text-foreground">{previewQty.unitsProduced.toLocaleString()}</strong>
                    </div>
                    <div className="text-muted-foreground">
                      Pack size: <strong className="text-foreground">{packConfig.unitsPerFinished} bottles per carton</strong>
                    </div>
                    {previewQty.exact ? (
                      <div className="text-muted-foreground">
                        Finished quantity to send to Unleashed:{" "}
                        <strong className="text-foreground">{previewQty.finishedQuantity.toLocaleString()} cartons</strong>
                      </div>
                    ) : (
                      <div className="text-amber-600 dark:text-amber-400">
                        Quantity does not match the finished product pack configuration.
                      </div>
                    )}
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Pass + supervisor signature increments the job's Completed total and asks you to confirm an Unleashed Assembly for this pallet only.
                </p>
              </div>



              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FileField label="Finished pallet photo (optional)" value={finishedProductFileName}
                  onChange={setFinishedProductFileName} accept="image/*" />
                <FileField label="Final product photo (optional)" value={finalProductPhotoName}
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              <Field label="Inspection checks">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {CHECKS.map(([key, label]) => (
                    <div key={key} className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-md px-3 py-2">
                      <span className="text-sm font-medium">{label}</span>
                      <div className="flex gap-1" role="group" aria-label={label}>
                        {(["Pass", "Fail"] as const).map(value => (
                          <Button key={value} type="button" size="sm" variant={checks[key] === value ? (value === "Fail" ? "destructive" : "default") : "outline"}
                            aria-pressed={checks[key] === value} aria-label={`${label}: ${value}`}
                            onClick={() => setChecks(current => ({ ...current, [key]: value }))}>
                            {value === "Pass" ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />} {value}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Field>
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

            {canWriteQc && editingEntryId && (
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

            {canWriteQc ? (
              <div className="flex flex-wrap gap-2">
                {!editingEntryId && <Button variant="outline" disabled={saveBusy || (!!partPalletId && !partPallet)} onClick={saveUnfinished}>
                  <Save className="size-4" /> {saveBusy ? "Saving…" : "Save part pallet"}
                </Button>}
                <Button className="flex-1" disabled={saveBusy || (!!partPalletId && !partPallet)} onClick={async () => {
                  if (saveBusy) return;
                  setSaveBusy(true);
                  try { await submit(); } catch { toast.error("QC could not be saved. Keep this form open and retry."); }
                  finally { setSaveBusy(false); }
                }}>
                  {editingEntryId ? "Save changes" : partPallet ? "Finish pallet & submit QC" : "Submit QC log"}
                </Button>
              </div>
            ) : (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                You can view quality-control records. Only admins and managers can create, edit, or delete them.
              </p>
            )}
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
                        toast.info(`${canWriteQc ? "Loaded" : "Viewing"} pallet #${h.palletNumber}`, {
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

      <AlertDialog open={missingDetailsOpen} onOpenChange={setMissingDetailsOpen}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>QC not saved — missing information</AlertDialogTitle>
            <AlertDialogDescription>
              Complete or correct the details below before saving. Photos are optional. Enter a full stop (.) if an M number is not applicable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {Object.entries(validationErrors).map(([label, error]) => (
              <li key={label}><span className="font-semibold">{label}</span>: {error}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setMissingDetailsOpen(false);
              requestAnimationFrame(() => document.querySelector('[data-qc-invalid="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" }));
            }}>Return to form</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                if (!entryToDelete || !canWriteQc) return;
                const removed = await deleteQC(entryToDelete);
                if (!removed) return;
                setEntryToDelete(null);
                resetForNew();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Safety check before any Unleashed assembly is created. */}
      <AlertDialog
        open={!!pendingAssembly}
        onOpenChange={(v) => { if (!v && !assemblyBusy) setPendingAssembly(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Unleashed Assembly?</AlertDialogTitle>
            <AlertDialogDescription>
              Review the finished quantity before it is sent to Unleashed. Unleashed scales its own
              Bill of Materials from this quantity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingAssembly && (() => {
            const calc = computeAssemblyQuantity(pendingAssembly.unitsProduced, packConfig.unitsPerFinished);
            return (
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-sm">
                <Row label="Finished SKU" value={packConfig.finishedSku || "—"} />
                <Row label="Pack configuration" value={packConfig.packLabel} />
                <Row label={`${packConfig.individualUnit}s produced`} value={calc.unitsProduced.toLocaleString()} />
                <Row label={`Units per ${packConfig.finishedUnit.toLowerCase()}`} value={String(calc.unitsPerFinished)} />
                <Row
                  label="Calculated finished quantity"
                  value={`${calc.exact ? calc.finishedQuantity.toLocaleString() : calc.finishedQuantity.toFixed(2)} ${packConfig.finishedUnit.toLowerCase()}s`}
                />
                <Row
                  label="Assembly quantity sent to Unleashed"
                  value={calc.exact ? calc.finishedQuantity.toLocaleString() : "—"}
                />
                <div className="pt-1 text-xs text-muted-foreground">
                  BOM used: Unleashed Bill of Materials for {packConfig.finishedSku || "this product"}
                  {job?.assemblyComponents?.length
                    ? ` — ${job.assemblyComponents
                        .map((c) => `${c.quantity} × ${c.productCode}`)
                        .join(", ")} per finished unit`
                    : ""}
                </div>
                {!calc.exact && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                    Quantity does not match the finished product pack configuration.{" "}
                    {calc.unitsProduced.toLocaleString()} ÷ {calc.unitsPerFinished} is not a whole
                    number of {packConfig.finishedUnit.toLowerCase()}s. Fix the units produced on the
                    pallet, then create the assembly manually.
                  </div>
                )}
              </div>
            );
          })()}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assemblyBusy} onClick={() => setPendingAssembly(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                assemblyBusy ||
                !pendingAssembly ||
                !computeAssemblyQuantity(pendingAssembly.unitsProduced, packConfig.unitsPerFinished).exact
              }
              onClick={(e) => {
                e.preventDefault();
                void confirmAssembly();
              }}
            >
              {assemblyBusy ? "Creating…" : "Create assembly"}
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
    </ValidationContext.Provider>
  );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const errors = useContext(ValidationContext);
  const id = useId();
  const error = errors[label];
  return (
    <div className={cn("space-y-1.5", error && "rounded-md ring-1 ring-destructive p-2")} data-qc-invalid={error ? "true" : undefined}>
      <Label id={id} className="text-xs uppercase text-muted-foreground">{label}</Label>
      <div role="group" aria-labelledby={id}>{children}</div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
