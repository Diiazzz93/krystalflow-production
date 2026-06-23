// Customer Production Specifications.
//
// Specs are now saved at TWO levels:
//   1. Customer-level defaults  (the legacy shape — kept as fallback)
//   2. Per-product overrides    (CustomerSpec.products[])
//
// Resolution for a job:
//   findEffectiveSpec(customer, productLabel)
//     → matches by product name (case-insensitive contains both ways)
//     → returns customer-level if no product match
//
// Storage: localStorage today, structured to map cleanly to:
//   customer_specs(customer_id, …customer defaults…)
//   customer_product_specs(customer_id, product_name, …overrides…)

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadSetting, saveSetting } from "./app-settings-kv";

const SETTING_KEY = "customer_specs";

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

/** Subset of fields visible in CustomerSpecsView. */
export interface SpecPayload {
  filling: FillingInstructions;
  packing: PackingInstructions;
  palletising: PalletisingInstructions;
  references: SpecReferenceFiles;
}

/** Product-level override under a customer. */
export interface ProductSpec extends SpecPayload {
  id: string; // stable within the customer
  productName: string; // e.g. "Purple Power Wash 1L"
  lineSetupNotes: string; // line setup requirements specific to this product
  specialInstructions: string;
  updatedAt: string;
}

export interface CustomerContact {
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export interface CustomerSpec extends SpecPayload, CustomerContact {
  id: string; // = customer name slug
  customer: string;
  products: ProductSpec[];
  updatedAt: string;
}

/** Resolved spec returned to the UI / PDF for a specific job. */
export interface ResolvedSpec extends SpecPayload {
  customer: string;
  productName?: string; // present if matched to a product override
  source: "product" | "customer-default";
  lineSetupNotes?: string;
  specialInstructions?: string;
}

const STORAGE_KEY = "krystalshield.customer-specs.v2";
const LEGACY_KEY_V1 = "krystalshield.customer-specs.v1";

function emptyPayload(): SpecPayload {
  return {
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
  };
}

export function emptyCustomerSpec(customer: string): CustomerSpec {
  return {
    id: customer.toLowerCase().replace(/\s+/g, "-") || `customer-${Date.now().toString(36)}`,
    customer,
    ...emptyPayload(),
    products: [],
    updatedAt: new Date().toISOString(),
  };
}

export function emptyProductSpec(productName: string): ProductSpec {
  return {
    id: `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    productName,
    ...emptyPayload(),
    lineSetupNotes: "",
    specialInstructions: "",
    updatedAt: new Date().toISOString(),
  };
}

// ----- Seed mock data (with one product override per customer) -----
function seedSpecs(): CustomerSpec[] {
  const aqua = emptyCustomerSpec("AquaPure Industries");
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

  const greenleaf = emptyCustomerSpec("GreenLeaf Agro");
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

  const marina = emptyCustomerSpec("MarinaCare");
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

  const nova = emptyCustomerSpec("NovaChem");
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

  const pure = emptyCustomerSpec("PureHome Brands");
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

  // ----- Per-product overrides (mock examples) -----
  aqua.products = [
    {
      ...emptyProductSpec("Pool Shock 1L"),
      filling: {
        ...aqua.filling,
        fillSize: "1L",
        containerType: "Blue-tinted HDPE 1L",
      },
      packing: { ...aqua.packing, unitsPerCarton: 8 },
      palletising: { ...aqua.palletising, cartonsPerLayer: 10, layersHigh: 5 },
      lineSetupNotes: "Line 1 only. Set fill nozzle to 80mm. Slow ramp for foaming product.",
      specialInstructions: "QC every 4th pallet — sample fill weight and cap torque.",
    },
    {
      ...emptyProductSpec("Pool Shock 5L"),
      filling: { ...aqua.filling, fillSize: "5L", containerType: "Blue-tinted HDPE 5L jug with handle" },
      packing: {
        ...aqua.packing,
        unitsPerCarton: 4,
        cartonType: "Heavy-duty AquaPure 5L shipper",
        packingNotes: "Handles aligned to short side. Foam corner inserts mandatory.",
      },
      palletising: { ...aqua.palletising, cartonsPerLayer: 6, layersHigh: 3, configurationNotes: "Column stack only — do not interlock 5L jugs." },
      lineSetupNotes: "Line 3 (heavy fill). Conveyor at 35Hz max.",
      specialInstructions: "Forklift only — do not hand-stack 5L pallets.",
    },
  ];

  marina.products = [
    {
      ...emptyProductSpec("Marine Hull Wash 750ml"),
      filling: { ...marina.filling, fillSize: "750ml" },
      packing: { ...marina.packing, packingNotes: "Triggers OFF, divider grid mandatory, hull wash leaflet on top." },
      palletising: marina.palletising,
      lineSetupNotes: "Line 2. Trigger sprayer assembly station active.",
      specialInstructions: "Salt-water exposure rated — verify cap torque 1.4–1.8 Nm.",
    },
  ];

  pure.products = [
    {
      ...emptyProductSpec("Multi-Surface Cleaner 500ml"),
      filling: { ...pure.filling, fillSize: "500ml", triggerSprayer: "Required — white trigger" },
      packing: { ...pure.packing, unitsPerCarton: 12, triggerInCarton: true },
      palletising: pure.palletising,
      lineSetupNotes: "Line 2 with trigger station enabled.",
      specialInstructions: "Retail audit pallet — must be photographed front and back before wrap.",
    },
    {
      ...emptyProductSpec("Multi-Surface Cleaner 1L"),
      filling: { ...pure.filling, fillSize: "1L", triggerSprayer: "Optional — disc-top default" },
      packing: { ...pure.packing, unitsPerCarton: 8 },
      palletising: { ...pure.palletising, cartonsPerLayer: 7, layersHigh: 5 },
      lineSetupNotes: "Line 1 or 2. Disc-top cap torque target 1.2 Nm.",
      specialInstructions: "Retail-ready — no shipper markings except print.",
    },
  ];

  return [aqua, greenleaf, marina, nova, pure];
}

// ----- Migration & load -----

interface LegacyV1Spec {
  id: string;
  customer: string;
  filling: FillingInstructions;
  packing: PackingInstructions;
  palletising: PalletisingInstructions;
  references: SpecReferenceFiles;
  updatedAt: string;
}

function migrateFromV1(): CustomerSpec[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY_V1);
    if (!raw) return null;
    const v1 = JSON.parse(raw) as LegacyV1Spec[];
    return v1.map((s) => ({ ...s, products: [] }));
  } catch {
    return null;
  }
}

function load(): CustomerSpec[] {
  if (typeof window === "undefined") return seedSpecs();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CustomerSpec[];
      // belt-and-braces: ensure products array exists on every entry
      return parsed.map((s) => ({ ...s, products: s.products ?? [] }));
    }
  } catch {
    /* ignore */
  }
  const migrated = migrateFromV1();
  if (migrated && migrated.length) return migrated;
  return seedSpecs();
}

// ----- Resolution helpers -----

function norm(s: string) {
  return s.toLowerCase().trim();
}

/** Find product override under a customer, matching loosely against product label. */
export function findProductMatch(
  spec: CustomerSpec,
  productLabel: string,
): ProductSpec | undefined {
  if (!productLabel) return undefined;
  const needle = norm(productLabel);
  // Exact name match wins
  const exact = spec.products.find((p) => norm(p.productName) === needle);
  if (exact) return exact;
  // Then contains either way (e.g. "Pool Shock 1L" matches job "Pool Shock 1L 12pk")
  return spec.products.find(
    (p) => needle.includes(norm(p.productName)) || norm(p.productName).includes(needle),
  );
}

/** Resolve the effective spec for a (customer, product) combination. */
export function resolveSpec(
  specs: CustomerSpec[],
  customer: string,
  productLabel?: string,
): ResolvedSpec | undefined {
  const cust = specs.find((s) => norm(s.customer) === norm(customer));
  if (!cust) return undefined;
  const product = productLabel ? findProductMatch(cust, productLabel) : undefined;
  if (product) {
    return {
      customer: cust.customer,
      productName: product.productName,
      source: "product",
      filling: product.filling,
      packing: product.packing,
      palletising: product.palletising,
      references: product.references,
      lineSetupNotes: product.lineSetupNotes,
      specialInstructions: product.specialInstructions,
    };
  }
  return {
    customer: cust.customer,
    source: "customer-default",
    filling: cust.filling,
    packing: cust.packing,
    palletising: cust.palletising,
    references: cust.references,
  };
}

// ----- Provider -----

interface CustomerSpecsValue {
  specs: CustomerSpec[];
  getSpecForCustomer: (customer: string) => CustomerSpec | undefined;
  getSpecForJob: (customer: string, product?: string) => ResolvedSpec | undefined;
  upsertSpec: (spec: CustomerSpec) => void;
  deleteSpec: (id: string) => void;
  upsertProduct: (customerId: string, product: ProductSpec) => void;
  deleteProduct: (customerId: string, productId: string) => void;
  createEmpty: (customer: string) => CustomerSpec;
  createEmptyProduct: (productName: string) => ProductSpec;
  resetToSeed: () => void;
}

const Ctx = createContext<CustomerSpecsValue | null>(null);

export function CustomerSpecsProvider({ children }: { children: ReactNode }) {
  const [specs, setSpecs] = useState<CustomerSpec[]>(() => load());
  const hydrated = useRef(false);

  // Hydrate from backend on mount.
  useEffect(() => {
    void (async () => {
      const remote = await loadSetting<CustomerSpec[]>(SETTING_KEY);
      if (Array.isArray(remote)) {
        setSpecs(remote.map((s) => ({ ...s, products: s.products ?? [] })));
      } else {
        await saveSetting(SETTING_KEY, specs).catch(() => {});
      }
      hydrated.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(specs));
    } catch {
      /* ignore */
    }
    if (hydrated.current) {
      void saveSetting(SETTING_KEY, specs).catch(() => {});
    }
  }, [specs]);

  const getSpecForCustomer = useCallback(
    (customer: string) => specs.find((s) => norm(s.customer) === norm(customer)),
    [specs],
  );

  const getSpecForJob = useCallback(
    (customer: string, product?: string) => resolveSpec(specs, customer, product),
    [specs],
  );

  const upsertSpec = useCallback((spec: CustomerSpec) => {
    setSpecs((curr) => {
      const next: CustomerSpec = {
        ...spec,
        products: spec.products ?? [],
        updatedAt: new Date().toISOString(),
      };
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

  const upsertProduct = useCallback((customerId: string, product: ProductSpec) => {
    setSpecs((curr) =>
      curr.map((c) => {
        if (c.id !== customerId) return c;
        const products = [...c.products];
        const idx = products.findIndex((p) => p.id === product.id);
        const stamped: ProductSpec = { ...product, updatedAt: new Date().toISOString() };
        if (idx === -1) products.push(stamped);
        else products[idx] = stamped;
        return { ...c, products, updatedAt: new Date().toISOString() };
      }),
    );
  }, []);

  const deleteProduct = useCallback((customerId: string, productId: string) => {
    setSpecs((curr) =>
      curr.map((c) =>
        c.id === customerId
          ? { ...c, products: c.products.filter((p) => p.id !== productId), updatedAt: new Date().toISOString() }
          : c,
      ),
    );
  }, []);

  const value = useMemo<CustomerSpecsValue>(
    () => ({
      specs,
      getSpecForCustomer,
      getSpecForJob,
      upsertSpec,
      deleteSpec,
      upsertProduct,
      deleteProduct,
      createEmpty: emptyCustomerSpec,
      createEmptyProduct: emptyProductSpec,
      resetToSeed: () => setSpecs(seedSpecs()),
    }),
    [specs, getSpecForCustomer, getSpecForJob, upsertSpec, deleteSpec, upsertProduct, deleteProduct],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCustomerSpecs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCustomerSpecs must be used within CustomerSpecsProvider");
  return ctx;
}

// ----- Non-hook accessors (for PDF and other module-scope callers) -----

export function getCustomerSpecsSync(): CustomerSpec[] {
  return load();
}

export function getSpecForCustomerSync(customer: string): CustomerSpec | undefined {
  return load().find((s) => norm(s.customer) === norm(customer));
}

export function getSpecForJobSync(
  customer: string,
  product?: string,
): ResolvedSpec | undefined {
  return resolveSpec(load(), customer, product);
}
