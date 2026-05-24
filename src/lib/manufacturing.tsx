// Manufacturing / BOM domain.
//
// Three core entities:
//   BulkFormulaBOM    - chemical recipe producing bulk liquid (litres)
//   FinishedProductBOM - packaging BOM linked to a BulkFormulaBOM
//   ProductionAssembly - job that picks a finished product + qty, computes requirements
//
// Plus a stock-check helper that flags whether on-hand inventory covers the assembly.
//
// Persisted in localStorage today; structure mirrors a future
// `manufacturing_*` set of tables so it can be swapped to Supabase.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MOCK_STOCK, type StockItem } from "@/lib/stock";

// ---------- Types ----------

export interface BulkIngredient {
  id: string;
  rawMaterialSku: string; // links to StockItem.sku
  name: string;
  quantity: number;
  unit: string; // L, kg, g, ml
  percentage?: number;
  notes?: string;
}

export interface BulkFormulaBOM {
  id: string;
  productName: string;
  formulaSku: string;
  outputUnit: "L";
  baseBatchSize: number; // produces this many litres
  ingredients: BulkIngredient[];
  notes: string;
  updatedAt: string;
}

export interface FinishedProductBOM {
  id: string;
  productName: string;
  productSku: string;
  bulkFormulaId: string; // -> BulkFormulaBOM.id
  containerSize: number; // litres per unit
  containerUnit: "L" | "ml";
  liquidPerUnit: number; // litres of bulk required per finished unit
  bottleSku: string;
  capSku: string;
  labelSku: string;
  cartonSku: string;
  unitsPerCarton: number;
  cartonsPerPallet?: number;
  palletNotes?: string;
  updatedAt: string;
}

export interface ProductionAssembly {
  id: string;
  reference: string;
  finishedProductId: string; // -> FinishedProductBOM.id
  unitsToProduce: number;
  scheduledFor?: string; // ISO date
  notes?: string;
  status: "Draft" | "Planned" | "In Progress" | "Complete";
  createdAt: string;
}

// ---------- Mock seed data ----------

function seedBulk(): BulkFormulaBOM[] {
  const now = new Date().toISOString();
  return [
    {
      id: "blk-degreaser",
      productName: "Industrial Degreaser Bulk Liquid",
      formulaSku: "BLK-DEGR",
      outputUnit: "L",
      baseBatchSize: 1000,
      notes: "Mix surfactant and solvent before adding to water. Add dye last.",
      updatedAt: now,
      ingredients: [
        { id: "i1", rawMaterialSku: "RAW-CHM-A", name: "Cleaning Concentrate A", quantity: 800, unit: "L", percentage: 80 },
        { id: "i2", rawMaterialSku: "RAW-CHM-B", name: "Sanitiser Base B", quantity: 150, unit: "L", percentage: 15 },
        { id: "i3", rawMaterialSku: "RAW-CHM-A", name: "Surfactant", quantity: 40, unit: "L", percentage: 4 },
        { id: "i4", rawMaterialSku: "RAW-CHM-B", name: "Blue Dye", quantity: 10, unit: "L", percentage: 1 },
      ],
    },
    {
      id: "blk-sanitiser",
      productName: "Pool Sanitiser Bulk Liquid",
      formulaSku: "BLK-SAN",
      outputUnit: "L",
      baseBatchSize: 1000,
      notes: "Class 5.1 oxidiser — full PPE during blend.",
      updatedAt: now,
      ingredients: [
        { id: "i1", rawMaterialSku: "RAW-CHM-B", name: "Sanitiser Base B", quantity: 900, unit: "L", percentage: 90 },
        { id: "i2", rawMaterialSku: "RAW-CHM-A", name: "Stabiliser", quantity: 100, unit: "L", percentage: 10 },
      ],
    },
  ];
}

function seedFinished(): FinishedProductBOM[] {
  const now = new Date().toISOString();
  return [
    {
      id: "fin-degr-5l",
      productName: "Degreaser 5L",
      productSku: "FIN-DEGR-5L",
      bulkFormulaId: "blk-degreaser",
      containerSize: 5,
      containerUnit: "L",
      liquidPerUnit: 5,
      bottleSku: "AQP-5L",
      capSku: "CAP-38MM",
      labelSku: "LBL-AQP-4L-F",
      cartonSku: "BOX-4X4L",
      unitsPerCarton: 4,
      cartonsPerPallet: 36,
      palletNotes: "Column stack, edge protectors on all 4 corners.",
      updatedAt: now,
    },
    {
      id: "fin-degr-1l",
      productName: "Degreaser 1L",
      productSku: "FIN-DEGR-1L",
      bulkFormulaId: "blk-degreaser",
      containerSize: 1,
      containerUnit: "L",
      liquidPerUnit: 1,
      bottleSku: "AQP-1L",
      capSku: "CAP-28MM",
      labelSku: "LBL-AQP-1L",
      cartonSku: "BOX-12X1L",
      unitsPerCarton: 12,
      cartonsPerPallet: 60,
      updatedAt: now,
    },
    {
      id: "fin-san-500",
      productName: "Pool Sanitiser 500ml",
      productSku: "FIN-SAN-500",
      bulkFormulaId: "blk-sanitiser",
      containerSize: 500,
      containerUnit: "ml",
      liquidPerUnit: 0.5,
      bottleSku: "AQP-500",
      capSku: "CAP-28MM",
      labelSku: "LBL-AQP-500",
      cartonSku: "BOX-12X500",
      unitsPerCarton: 12,
      cartonsPerPallet: 80,
      updatedAt: now,
    },
  ];
}

function seedAssemblies(): ProductionAssembly[] {
  return [
    {
      id: "asm-001",
      reference: "ASM-001",
      finishedProductId: "fin-degr-5l",
      unitsToProduce: 1000,
      status: "Planned",
      scheduledFor: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
      notes: "First production run of Q3 — verify formula with QC before fill.",
      createdAt: new Date().toISOString(),
    },
  ];
}

// ---------- Calculation helpers ----------

export interface RequirementLine {
  label: string;
  sku?: string;
  required: number;
  unit: string;
  category: "bulk" | "raw" | "packaging";
}

export interface StockCheckLine extends RequirementLine {
  available: number;
  missing: number;
  status: "ok" | "low" | "missing";
}

export interface AssemblyCalculation {
  finished?: FinishedProductBOM;
  bulk?: BulkFormulaBOM;
  unitsToProduce: number;
  bulkLitresRequired: number;
  cartonsRequired: number;
  palletsRequired?: number;
  lines: RequirementLine[];
}

export function calculateAssembly(
  units: number,
  finished?: FinishedProductBOM,
  bulk?: BulkFormulaBOM,
): AssemblyCalculation {
  const result: AssemblyCalculation = {
    finished,
    bulk,
    unitsToProduce: units,
    bulkLitresRequired: 0,
    cartonsRequired: 0,
    lines: [],
  };
  if (!finished || units <= 0) return result;

  const bulkLitres = units * finished.liquidPerUnit;
  result.bulkLitresRequired = bulkLitres;

  const cartons = Math.ceil(units / Math.max(1, finished.unitsPerCarton));
  result.cartonsRequired = cartons;
  if (finished.cartonsPerPallet) {
    result.palletsRequired = Math.ceil(cartons / finished.cartonsPerPallet);
  }

  // Bulk liquid
  result.lines.push({
    label: bulk ? bulk.productName : "Bulk liquid",
    sku: bulk?.formulaSku,
    required: bulkLitres,
    unit: "L",
    category: "bulk",
  });

  // Raw materials scaled from the bulk formula
  if (bulk) {
    const scale = bulkLitres / Math.max(1, bulk.baseBatchSize);
    for (const ing of bulk.ingredients) {
      result.lines.push({
        label: ing.name,
        sku: ing.rawMaterialSku,
        required: round(ing.quantity * scale),
        unit: ing.unit,
        category: "raw",
      });
    }
  }

  // Packaging
  result.lines.push(
    { label: "Bottles / drums", sku: finished.bottleSku, required: units, unit: "ea", category: "packaging" },
    { label: "Caps", sku: finished.capSku, required: units, unit: "ea", category: "packaging" },
    { label: "Labels", sku: finished.labelSku, required: units, unit: "ea", category: "packaging" },
    { label: "Cartons", sku: finished.cartonSku, required: cartons, unit: "ea", category: "packaging" },
  );

  return result;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function checkStock(
  calc: AssemblyCalculation,
  stock: StockItem[],
): StockCheckLine[] {
  return calc.lines.map((line) => {
    const item = line.sku ? stock.find((s) => s.sku === line.sku) : undefined;
    const available = item?.availableStock ?? 0;
    const missing = Math.max(0, line.required - available);
    const status: StockCheckLine["status"] =
      missing <= 0 ? "ok" : available <= 0 ? "missing" : "low";
    return { ...line, available, missing, status };
  });
}

// ---------- Storage / provider ----------

const STORAGE_KEY = "krystalshield.manufacturing.v1";

interface PersistShape {
  bulkBOMs: BulkFormulaBOM[];
  finishedBOMs: FinishedProductBOM[];
  assemblies: ProductionAssembly[];
}

function load(): PersistShape {
  const seeded: PersistShape = {
    bulkBOMs: seedBulk(),
    finishedBOMs: seedFinished(),
    assemblies: seedAssemblies(),
  };
  if (typeof window === "undefined") return seeded;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seeded;
    const parsed = JSON.parse(raw) as PersistShape;
    return {
      bulkBOMs: parsed.bulkBOMs ?? seeded.bulkBOMs,
      finishedBOMs: parsed.finishedBOMs ?? seeded.finishedBOMs,
      assemblies: parsed.assemblies ?? seeded.assemblies,
    };
  } catch {
    return seeded;
  }
}

interface ManufacturingValue extends PersistShape {
  stock: StockItem[];
  upsertBulk: (bom: BulkFormulaBOM) => void;
  deleteBulk: (id: string) => void;
  upsertFinished: (bom: FinishedProductBOM) => void;
  deleteFinished: (id: string) => void;
  upsertAssembly: (a: ProductionAssembly) => void;
  deleteAssembly: (id: string) => void;
  newBulk: () => BulkFormulaBOM;
  newFinished: () => FinishedProductBOM;
  newAssembly: () => ProductionAssembly;
}

const Ctx = createContext<ManufacturingValue | null>(null);

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function ManufacturingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PersistShape>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }, [data]);




  const upsertBulk = useCallback((bom: BulkFormulaBOM) => {
    setData((d) => {
      const next = { ...bom, updatedAt: new Date().toISOString() };
      const idx = d.bulkBOMs.findIndex((b) => b.id === bom.id);
      const list = idx >= 0 ? d.bulkBOMs.map((b, i) => (i === idx ? next : b)) : [...d.bulkBOMs, next];
      return { ...d, bulkBOMs: list };
    });
  }, []);
  const deleteBulk = useCallback((id: string) => {
    setData((d) => ({ ...d, bulkBOMs: d.bulkBOMs.filter((b) => b.id !== id) }));
  }, []);

  const upsertFinished = useCallback((bom: FinishedProductBOM) => {
    setData((d) => {
      const next = { ...bom, updatedAt: new Date().toISOString() };
      const idx = d.finishedBOMs.findIndex((b) => b.id === bom.id);
      const list = idx >= 0 ? d.finishedBOMs.map((b, i) => (i === idx ? next : b)) : [...d.finishedBOMs, next];
      return { ...d, finishedBOMs: list };
    });
  }, []);
  const deleteFinished = useCallback((id: string) => {
    setData((d) => ({ ...d, finishedBOMs: d.finishedBOMs.filter((b) => b.id !== id) }));
  }, []);

  const upsertAssembly = useCallback((a: ProductionAssembly) => {
    setData((d) => {
      const idx = d.assemblies.findIndex((x) => x.id === a.id);
      const list = idx >= 0 ? d.assemblies.map((x, i) => (i === idx ? a : x)) : [...d.assemblies, a];
      return { ...d, assemblies: list };
    });
  }, []);
  const deleteAssembly = useCallback((id: string) => {
    setData((d) => ({ ...d, assemblies: d.assemblies.filter((x) => x.id !== id) }));
  }, []);

  const newBulk = useCallback<ManufacturingValue["newBulk"]>(
    () => ({
      id: uid("blk"),
      productName: "",
      formulaSku: "",
      outputUnit: "L",
      baseBatchSize: 1000,
      ingredients: [],
      notes: "",
      updatedAt: new Date().toISOString(),
    }),
    [],
  );
  const newFinished = useCallback<ManufacturingValue["newFinished"]>(
    () => ({
      id: uid("fin"),
      productName: "",
      productSku: "",
      bulkFormulaId: "",
      containerSize: 1,
      containerUnit: "L",
      liquidPerUnit: 1,
      bottleSku: "",
      capSku: "",
      labelSku: "",
      cartonSku: "",
      unitsPerCarton: 12,
      cartonsPerPallet: 60,
      updatedAt: new Date().toISOString(),
    }),
    [],
  );
  const newAssembly = useCallback<ManufacturingValue["newAssembly"]>(
    () => ({
      id: uid("asm"),
      reference: `ASM-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`,
      finishedProductId: "",
      unitsToProduce: 100,
      status: "Draft",
      createdAt: new Date().toISOString(),
    }),
    [],
  );

  const value = useMemo<ManufacturingValue>(
    () => ({
      ...data,
      stock: MOCK_STOCK,
      upsertBulk,
      deleteBulk,
      upsertFinished,
      deleteFinished,
      upsertAssembly,
      deleteAssembly,
      newBulk,
      newFinished,
      newAssembly,
    }),
    [data, upsertBulk, deleteBulk, upsertFinished, deleteFinished, upsertAssembly, deleteAssembly, newBulk, newFinished, newAssembly],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useManufacturing() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useManufacturing must be used within ManufacturingProvider");
  return ctx;
}

// silence "update unused" linter noise if any
void update;
