export const QC_CHECK_KEYS = ["fillLevel", "capTightness", "labelAlignment", "batchCode", "leakCheck", "bottleCondition"] as const;
export type QCCheckKey = (typeof QC_CHECK_KEYS)[number];
export const EMPTY_QC_CHECKS: Record<QCCheckKey, "Pass" | "Fail" | ""> = {
  fillLevel: "", capTightness: "", labelAlignment: "", batchCode: "", leakCheck: "", bottleCondition: "",
};

export function isDiggersProduct(identity: { customer?: string; product?: string; sku?: string }) {
  return /\bdiggers\b/i.test([identity.customer, identity.product, identity.sku].filter(Boolean).join(" "));
}

export interface QCFormValues {
  standalone: boolean;
  title: string;
  mNumber: string;
  logDate: string;
  operatorName: string;
  bottleWeight: number | "";
  capWeight: number | "";
  liquidWeightPer100ml: number | "";
  totalWeightGrams: number | "";
  palletRowVolumes: { row: string; pump1: string; pump2: string }[];
  startTime: string;
  finishTime: string;
  minimumVolume: number | "";
  maximumVolume: number | "";
  palletNumber: number;
  boxesPerPallet: number | "";
  bottleCount: number | "";
  palletQuantity: number | "";
  palletType: string;
  bottleQcOperator: string;
  capperOperator: string;
  packagingOperator: string;
  checks: Record<QCCheckKey, string>;
  supervisorName: string;
  supervisorSignatureDataUrl?: string;
  notes: string;
}

/** A pallet-row line counts as complete when it meets the submit rule: a row name and both pump volumes above zero. */
export function isCompletePalletRow(row: unknown): boolean {
  if (!row || typeof row !== "object") return false;
  const record = row as { row?: unknown; pump1?: unknown; pump2?: unknown };
  return typeof record.row === "string" && record.row.trim().length > 0 && isPositiveVolume(record.pump1) && isPositiveVolume(record.pump2);
}

function isPositiveVolume(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value !== "string" || value.trim().length === 0) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function validateQCForm(v: QCFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const text = (label: string, value: string) => {
    if (!value.trim()) errors[label] = `${label} is required.`;
  };
  const positive = (label: string, value: number | "", whole = false) => {
    if (value === "" || !Number.isFinite(value) || value <= 0 || (whole && !Number.isInteger(value))) {
      errors[label] = `Enter a positive ${whole ? "whole number" : "number"} for ${label.toLowerCase()}.`;
    }
  };
  if (v.standalone) text("What is this QC check for?", v.title);
  text("M Number", v.mNumber);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.logDate) || !Number.isFinite(Date.parse(v.logDate))) errors.Date = "Enter the date.";
  text("Operator", v.operatorName);
  positive("Bottle weight (g)", v.bottleWeight);
  positive("Cap weight (g)", v.capWeight);
  positive("Liquid weight", v.liquidWeightPer100ml);
  positive("Total weight (g)", v.totalWeightGrams);
  if (!v.palletRowVolumes.length || v.palletRowVolumes.some((r) => !isCompletePalletRow(r))) {
    errors["Pallet row volumes"] = "Complete every row with a row name and positive Pump 1 and Pump 2 volumes.";
  }
  for (const [label, time] of [["Start time", v.startTime], ["Finish time", v.finishTime]]) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors[label] = `Enter the ${label.toLowerCase()}.`;
  }
  positive("Minimum volume", v.minimumVolume);
  positive("Maximum volume", v.maximumVolume);
  if (v.minimumVolume !== "" && v.maximumVolume !== "" && v.maximumVolume < v.minimumVolume) errors["Maximum volume"] = "Maximum volume must not be below minimum volume.";
  positive("Pallet #", v.palletNumber, true);
  positive("Boxes per pallet", v.boxesPerPallet, true);
  positive("Bottle count", v.bottleCount, true);
  positive("Units produced on this pallet", v.palletQuantity, true);
  if (!["CHEP", "Recochem", "Plain"].includes(v.palletType)) errors["Pallet type"] = "Select the pallet type.";
  text("Bottle / QC", v.bottleQcOperator);
  text("Capper", v.capperOperator);
  text("Packaging", v.packagingOperator);
  if (QC_CHECK_KEYS.some(k => v.checks[k] !== "Pass" && v.checks[k] !== "Fail")) errors["Inspection checks"] = "Choose Pass or Fail for all six inspection checks.";
  text("Supervisor", v.supervisorName);
  if (!v.supervisorSignatureDataUrl?.startsWith("data:image/png;base64,")) errors.Signature = "Supervisor signature is required.";
  text("Notes", v.notes);
  return errors;
}