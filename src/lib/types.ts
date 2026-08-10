export type JobStatus =
  | "Scheduled"
  | "Setup"
  | "Filling"
  | "Capping"
  | "Labelling"
  | "Packing"
  | "QC Review"
  | "Complete"
  | "Pending Assembly Approval"
  | "Assembly Completed"
  | "Delayed"
  | "On Hold"
  | "Requires Review";

export type Priority = "Low" | "Normal" | "High" | "Urgent";

export type ReadyState = "Pending" | "Ready" | "Issue";

export interface CustomerSuppliedItem {
  category: string;
  description: string;
  quantity: number;
  unit: string;
}

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
  // Section operators - for narrowing down where an issue occurred
  fillOperator?: string;
  bottleQcOperator?: string;
  capperOperator?: string;
  packagingOperator?: string;
  // Unique human-readable code printed on the pallet sticker for traceability
  palletCode?: string;
  /** Type of physical pallet used — surfaced on Shipping so the right pallet stock is picked. */
  palletType?: "CHEP" | "Recochem" | "Plain";
  // Production progress tracking
  /** Boxes/units produced on this pallet. Defaults to job.originalQuantity / job.originalPallets. */
  palletQuantity?: number;
  /** True when QC passed and supervisor signed off — triggers per-pallet Unleashed Assembly. */
  qcApproved?: boolean;
  unleashedAssemblyId?: string;
  unleashedAssemblyNumber?: string;
  unleashedAssemblyStatus?: string;
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
  scheduledStart?: string; // ISO datetime - set when job is allocated to calendar
  scheduledEnd?: string; // ISO datetime - optional explicit end (for multi-day jobs)
  plannedStart?: string; // ISO - planned start (defaults to scheduledStart)
  plannedEnd?: string; // ISO - planned finish (defaults to scheduledEnd/estimatedFinish)
  actualStart?: string; // ISO - actual start when job entered production
  actualEnd?: string; // ISO - actual completion timestamp
  bottlesCompleted: number;
  palletsCompleted: number;
  downtimeMinutes: number;
  actualRuntimeMinutes: number;
  customerColor: string; // hex
  calendarLabel?: string; // optional display label for calendar pills (does not change customer/product)
  bottlesPerCarton?: number; // pack size override; defaults to 12
  cartonsOrdered?: number; // when the SO line is for boxes (e.g. 672 cartons of 6 × 1L)
  bottleSku?: string; // selected bottle stock SKU
  capSku?: string; // selected cap stock SKU
  labelSku?: string; // selected label stock SKU
  cartonSku?: string; // selected carton stock SKU
  liquidSku?: string; // selected bulk liquid / product-to-fill SKU
  createdAt: string;
  // Unleashed-linked assembly metadata (present when imported from a Fill Ready SO)
  unleashedSalesOrderNumber?: string;
  importedFromUnleashedAt?: string;
  unleashedAssemblyNumber?: string;
  assemblyComponents?: AssemblyComponent[];
  assemblyStatus?: string;
  assemblyCreatedAt?: string;
  assemblyCompletedAt?: string;
  // Production progress (Sales Order tracking)
  /** Master order quantity from the imported Sales Order. Never reduced. */
  originalQuantity?: number;
  /** Master pallet count from import. Never reduced. */
  originalPallets?: number;
  /** Sum of QC-approved pallet quantities. Mirrors palletsCompleted's per-pallet totals. */
  completedQuantity?: number;
  /** Mirrors palletsCompleted as a stable progress field. */
  completedPallets?: number;
}

export interface AssemblyComponent {
  productCode: string;
  productGuid?: string;
  name: string;
  quantity: number;
  unit?: string;
}

export interface Line {
  id: string;
  name: string;
  capacityBph: number;
}
