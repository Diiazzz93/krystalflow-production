export type JobStatus =
  | "Scheduled"
  | "Setup"
  | "Filling"
  | "Capping"
  | "Labelling"
  | "Packing"
  | "QC Review"
  | "Complete"
  | "Delayed"
  | "On Hold"
  | "Requires Review";

export type Priority = "Low" | "Normal" | "High" | "Urgent";

export type ReadyState = "Pending" | "Ready" | "Issue";

export interface QCEntry {
  id: string;
  jobId: string;
  palletNumber: number;
  fillLevel: "Pass" | "Fail";
  capTightness: "Pass" | "Fail";
  labelAlignment: "Pass" | "Fail";
  batchCode: "Pass" | "Fail";
  leakCheck: "Pass" | "Fail";
  bottleCondition: "Pass" | "Fail";
  bottleCount: number;
  operatorName: string;
  supervisorSignoff: string;
  notes: string;
  photoPlaceholder?: string;
  timestamp: string; // ISO
  result: "Pass" | "Fail";
  // Filling Line Log Sheet (JotForm parity)
  mNumber?: string;
  logDate?: string; // YYYY-MM-DD
  bottleWeight?: number; // grams
  capWeight?: number; // grams
  liquidWeightPer100ml?: number; // grams / 100ml
  totalWeightGrams?: number; // grams
  palletRowVolumes?: { row: string; pump1: string; pump2: string }[];
  startTime?: string; // HH:MM
  finishTime?: string; // HH:MM
  minimumVolume?: number;
  maximumVolume?: number;
  boxesPerPallet?: number;
  finishedProductFileName?: string; // placeholder
  finalProductPhotoName?: string; // placeholder
  supervisorName?: string;
  supervisorSignatureDataUrl?: string; // base64 PNG from canvas
}

export interface Job {
  id: string;
  customer: string;
  product: string;
  sku: string;
  bottleSize: string; // e.g. "500ml"
  quantity: number; // bottles required
  pallets: number;
  dueDate: string; // ISO date
  priority: Priority;
  line: string;
  operator: string;
  bottlesPerHour: number;
  setupMinutes: number;
  notes: string;
  rawMaterial: ReadyState;
  labels: ReadyState;
  packaging: ReadyState;
  status: JobStatus;
  scheduledStart: string; // ISO datetime
  bottlesCompleted: number;
  palletsCompleted: number;
  downtimeMinutes: number;
  actualRuntimeMinutes: number;
  customerColor: string; // hex
  createdAt: string;
}

export interface Line {
  id: string;
  name: string;
  capacityBph: number;
}
