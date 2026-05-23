// Customer Production Specifications.
//
// Each customer can have saved filling, packing, palletising instructions
// and reference photos that automatically appear inside their jobs.
//
// Storage: localStorage today, structured to swap for a Supabase table later.
// Shape kept flat & serializable so a `customer_specs` table maps 1:1.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface FillingInstructions {
  productType: string;
  containerType: string;
  fillSize: string;
  capType: string;
  labelRequirements: string;
  labelPositioning: string;
  triggerSprayer: string;
  hazardSdsNotes: string;
}

export interface PackingInstructions {
  unitsPerCarton: number;
  cartonType: string;
  cartonLabelRequired: boolean;
  triggerInCarton: boolean;
  packingNotes: string;
}

export interface PalletisingInstructions {
  palletType: string;
  cartonsPerLayer: number;
  layersHigh: number;
  configurationNotes: string;
  wrapRequirements: string;
  palletLabelRequirements: string;
  specialRequirements: string;
}

export interface SpecReferenceFiles {
  palletPhoto?: string; // data URL placeholder
  cartonPhoto?: string;
  labelPhoto?: string;
}

export interface CustomerSpec {
  id: string; // = customer name slug
  customer: string;
  filling: FillingInstructions;
  packing: PackingInstructions;
  palletising: PalletisingInstructions;
  references: SpecReferenceFiles;
  updatedAt: string; // ISO
}

const STORAGE_KEY = "krystalshield.customer-specs.v1";

function emptySpec(customer: string): CustomerSpec {
  return {
    id: customer.toLowerCase().replace(/\s+/g, "-"),
    customer,
    filling: {
      productType: "",
      containerType: "",
      fillSize: "",
      capType: "",
      labelRequirements: "",
      labelPositioning: "",
      triggerSprayer: "",
      hazardSdsNotes: "",
    },
    packing: {
      unitsPerCarton: 12,
      cartonType: "",
      cartonLabelRequired: true,
      triggerInCarton: false,
      packingNotes: "",
    },
    palletising: {
      palletType: "Standard CHEP",
      cartonsPerLayer: 8,
      layersHigh: 5,
      configurationNotes: "",
      wrapRequirements: "",
      palletLabelRequirements: "",
      specialRequirements: "",
    },
    references: {},
    updatedAt: new Date().toISOString(),
  };
}

// Seed mock data so the feature is useful immediately.
function seedSpecs(): CustomerSpec[] {
  const aqua = emptySpec("AquaPure Industries");
  aqua.filling = {
    productType: "Pool sanitiser concentrate",
    containerType: "HDPE bottle, blue tint",
    fillSize: "1L / 5L",
    capType: "38mm child-resistant cap",
    labelRequirements: "Front + back wrap, GHS pictograms, batch + best-before printed",
    labelPositioning: "Front label 15mm from base, back label aligned to front centre",
    triggerSprayer: "Not required",
    hazardSdsNotes: "Class 5.1 oxidiser — keep away from organics. SDS rev 4.2 must ship with first carton.",
  };
  aqua.packing = {
    unitsPerCarton: 6,
    cartonType: "Double-wall brown corrugate, AquaPure print",
    cartonLabelRequired: true,
    triggerInCarton: false,
    packingNotes: "Bottles upright only. Insert AquaPure information leaflet on top of bottles before sealing.",
  };
  aqua.palletising = {
    palletType: "CHEP 1165 x 1165",
    cartonsPerLayer: 8,
    layersHigh: 4,
    configurationNotes: "Brick stack pattern, alternate every layer. Slip sheet between layers 2 and 3.",
    wrapRequirements: "Clear stretch wrap, minimum 3 full wraps top + bottom, must cover top cap layer.",
    palletLabelRequirements: "SSCC label on two adjacent sides at eye height.",
    specialRequirements: "Do not double-stack pallets in transit.",
  };

  const greenleaf = emptySpec("GreenLeaf Agro");
  greenleaf.filling = {
    productType: "Agricultural surfactant",
    containerType: "Natural HDPE",
    fillSize: "500ml",
    capType: "28mm flip-top",
    labelRequirements: "Front label only, soy-based ink",
    labelPositioning: "Centred vertically, 20mm from base",
    triggerSprayer: "Not required",
    hazardSdsNotes: "Non-hazardous. Avoid eye contact.",
  };
  greenleaf.packing = {
    unitsPerCarton: 12,
    cartonType: "FSC-certified single-wall",
    cartonLabelRequired: true,
    triggerInCarton: false,
    packingNotes: "Recyclable tape only. No plastic strapping.",
  };
  greenleaf.palletising = {
    palletType: "Heat-treated softwood 1200 x 1000",
    cartonsPerLayer: 10,
    layersHigh: 6,
    configurationNotes: "Column stack to preserve carton print orientation.",
    wrapRequirements: "Biodegradable stretch wrap.",
    palletLabelRequirements: "GreenLeaf branded pallet label on the long side facing the loading dock.",
    specialRequirements: "Photograph each finished pallet before dispatch.",
  };

  const marina = emptySpec("MarinaCare");
  marina.filling = {
    productType: "Marine surface cleaner",
    containerType: "750ml trigger-spray bottle",
    fillSize: "750ml",
    capType: "28/410 trigger sprayer, white",
    labelRequirements: "Wrap-around label with marine GHS labelling",
    labelPositioning: "Seam aligned to bottle back, no air bubbles",
    triggerSprayer: "Required — assembled before packing",
    hazardSdsNotes: "Mild irritant. Eye protection during fill.",
  };
  marina.packing = {
    unitsPerCarton: 12,
    cartonType: "MarinaCare branded carton",
    cartonLabelRequired: true,
    triggerInCarton: true,
    packingNotes: "Triggers pre-locked to OFF before carton seal. 4x3 layout, dividers in.",
  };
  marina.palletising = {
    palletType: "CHEP 1165",
    cartonsPerLayer: 8,
    layersHigh: 5,
    configurationNotes: "Pinwheel pattern, dividers between layers.",
    wrapRequirements: "Black tinted wrap for UV protection.",
    palletLabelRequirements: "Two SSCC labels + MarinaCare pallet sheet on top.",
    specialRequirements: "Tail-lift delivery only. Pallets must clear 1.6m height.",
  };

  const nova = emptySpec("NovaChem");
  nova.filling = {
    productType: "Industrial degreaser",
    containerType: "Black HDPE jerry can",
    fillSize: "5L / 20L",
    capType: "Tamper-evident 51mm screw cap",
    labelRequirements: "Industrial GHS label, UN number printed",
    labelPositioning: "On the wide flat face, opposite the handle",
    triggerSprayer: "Not required",
    hazardSdsNotes: "Class 8 corrosive. PPE mandatory. Bund tray under fill head.",
  };
  nova.packing = {
    unitsPerCarton: 4,
    cartonType: "Heavy-duty corrugate with internal divider",
    cartonLabelRequired: true,
    triggerInCarton: false,
    packingNotes: "Cap seals must be intact. Reject any leaking units to QC hold.",
  };
  nova.palletising = {
    palletType: "Heat-treated hardwood 1200 x 1000",
    cartonsPerLayer: 6,
    layersHigh: 3,
    configurationNotes: "Column stack, edge protectors on all 4 corners.",
    wrapRequirements: "Heavy-gauge stretch wrap + top sheet.",
    palletLabelRequirements: "Hazardous goods placard on two opposite sides.",
    specialRequirements: "Dispatch only with ADR-trained driver.",
  };

  const pure = emptySpec("PureHome Brands");
  pure.filling = {
    productType: "Household multi-surface cleaner",
    containerType: "Frosted PET bottle",
    fillSize: "500ml / 1L",
    capType: "28mm disc-top closure",
    labelRequirements: "Premium matte label, foil accent",
    labelPositioning: "Front label 12mm from shoulder, back label 12mm from base",
    triggerSprayer: "Optional — see SKU",
    hazardSdsNotes: "Non-hazardous consumer product.",
  };
  pure.packing = {
    unitsPerCarton: 12,
    cartonType: "Branded PureHome retail-ready shipper",
    cartonLabelRequired: true,
    triggerInCarton: false,
    packingNotes: "Shelf-ready: perforated front opens to retail display. Do not crush.",
  };
  pure.palletising = {
    palletType: "CHEP 1165",
    cartonsPerLayer: 8,
    layersHigh: 5,
    configurationNotes: "Print-out orientation must face long side for retail audit.",
    wrapRequirements: "Clear wrap, 2 full rotations only — must remain easy to remove in-store.",
    palletLabelRequirements: "PureHome SSCC + retailer GLN label.",
    specialRequirements: "Retail-ready: no markings on cartons except printed branding.",
  };

  return [aqua, greenleaf, marina, nova, pure];
}

function load(): CustomerSpec[] {
  if (typeof window === "undefined") return seedSpecs();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CustomerSpec[];
  } catch {
    /* ignore */
  }
  return seedSpecs();
}

interface CustomerSpecsValue {
  specs: CustomerSpec[];
  getSpecForCustomer: (customer: string) => CustomerSpec | undefined;
  upsertSpec: (spec: CustomerSpec) => void;
  deleteSpec: (id: string) => void;
  createEmpty: (customer: string) => CustomerSpec;
  resetToSeed: () => void;
}

const Ctx = createContext<CustomerSpecsValue | null>(null);

export function CustomerSpecsProvider({ children }: { children: ReactNode }) {
  const [specs, setSpecs] = useState<CustomerSpec[]>(() => load());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(specs));
    } catch {
      /* ignore */
    }
  }, [specs]);

  const getSpecForCustomer = useCallback(
    (customer: string) =>
      specs.find((s) => s.customer.toLowerCase() === customer.toLowerCase()),
    [specs],
  );

  const upsertSpec = useCallback((spec: CustomerSpec) => {
    setSpecs((curr) => {
      const next = { ...spec, updatedAt: new Date().toISOString() };
      const idx = curr.findIndex((s) => s.id === spec.id);
      if (idx === -1) return [...curr, next];
      const copy = [...curr];
      copy[idx] = next;
      return copy;
    });
  }, []);

  const deleteSpec = useCallback((id: string) => {
    setSpecs((curr) => curr.filter((s) => s.id !== id));
  }, []);

  const value = useMemo<CustomerSpecsValue>(
    () => ({
      specs,
      getSpecForCustomer,
      upsertSpec,
      deleteSpec,
      createEmpty: emptySpec,
      resetToSeed: () => setSpecs(seedSpecs()),
    }),
    [specs, getSpecForCustomer, upsertSpec, deleteSpec],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCustomerSpecs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCustomerSpecs must be used within CustomerSpecsProvider");
  return ctx;
}

// Non-hook accessor for PDF generation (called outside React tree).
export function getCustomerSpecsSync(): CustomerSpec[] {
  return load();
}

export function getSpecForCustomerSync(customer: string): CustomerSpec | undefined {
  return load().find((s) => s.customer.toLowerCase() === customer.toLowerCase());
}
