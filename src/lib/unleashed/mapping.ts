// Unleashed → KrystalFlow mapping store.
//
// Persists in localStorage (mock-mode, same as the rest of the Unleashed
// integration). Three pieces of state:
//   1. Sources to sync (per Unleashed category checkbox)
//   2. KrystalFlow categories (user-managed list)
//   3. Product mappings (Unleashed ProductCode → KF category id)
//   4. Rules (pattern in code/name → KF category id), applied as suggestions
//      when no explicit mapping exists.

import type { UnleashedCategory } from "./types";

const SOURCES_KEY = "unleashed.sources";
const CATEGORIES_KEY = "unleashed.kf-categories";
const MAPPINGS_KEY = "unleashed.product-mappings";
const RULES_KEY = "unleashed.mapping-rules";

export interface KfCategory {
  id: string;
  name: string;
}

export interface ProductMapping {
  /** Unleashed ProductCode (SKU). */
  productCode: string;
  /** KfCategory id. Empty string means "ignored / not mapped". */
  kfCategoryId: string;
}

export type RuleField = "code" | "name";
export type RuleMatch = "contains" | "startsWith" | "endsWith" | "equals";

export interface MappingRule {
  id: string;
  field: RuleField;
  match: RuleMatch;
  /** Pattern is matched case-insensitively. */
  pattern: string;
  kfCategoryId: string;
}

export type SourceToggles = Record<UnleashedCategory, boolean>;

const DEFAULT_SOURCES: SourceToggles = {
  product: true,
  bottle: true,
  cap: true,
  label: true,
  carton: true,
  liquid: true,
};

const DEFAULT_CATEGORIES: KfCategory[] = [
  { id: "kf-bottles", name: "Bottles" },
  { id: "kf-caps", name: "Caps" },
  { id: "kf-labels", name: "Labels" },
  { id: "kf-chemicals", name: "Chemicals" },
  { id: "kf-packaging", name: "Packaging" },
  { id: "kf-other", name: "Other" },
];

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
export function subscribeMapping(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
  emit();
}

// ---- Sources ---------------------------------------------------------------

export function getSourceToggles(): SourceToggles {
  return { ...DEFAULT_SOURCES, ...read<Partial<SourceToggles>>(SOURCES_KEY, {}) };
}
export function setSourceToggle(cat: UnleashedCategory, enabled: boolean) {
  const next = { ...getSourceToggles(), [cat]: enabled };
  write(SOURCES_KEY, next);
}

// ---- KF categories ---------------------------------------------------------

export function getKfCategories(): KfCategory[] {
  return read<KfCategory[]>(CATEGORIES_KEY, DEFAULT_CATEGORIES);
}
export function addKfCategory(name: string): KfCategory {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name required");
  const cat: KfCategory = {
    id: `kf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: trimmed,
  };
  write(CATEGORIES_KEY, [...getKfCategories(), cat]);
  return cat;
}
export function renameKfCategory(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  write(
    CATEGORIES_KEY,
    getKfCategories().map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
  );
}
export function deleteKfCategory(id: string) {
  write(
    CATEGORIES_KEY,
    getKfCategories().filter((c) => c.id !== id),
  );
  // Clear any mappings/rules pointing at the removed category.
  write(
    MAPPINGS_KEY,
    getProductMappings().filter((m) => m.kfCategoryId !== id),
  );
  write(
    RULES_KEY,
    getRules().filter((r) => r.kfCategoryId !== id),
  );
}

// ---- Product mappings ------------------------------------------------------

export function getProductMappings(): ProductMapping[] {
  return read<ProductMapping[]>(MAPPINGS_KEY, []);
}
export function setProductMapping(productCode: string, kfCategoryId: string) {
  const list = getProductMappings().filter((m) => m.productCode !== productCode);
  if (kfCategoryId) list.push({ productCode, kfCategoryId });
  write(MAPPINGS_KEY, list);
}
export function clearProductMapping(productCode: string) {
  write(
    MAPPINGS_KEY,
    getProductMappings().filter((m) => m.productCode !== productCode),
  );
}

// ---- Rules -----------------------------------------------------------------

export function getRules(): MappingRule[] {
  return read<MappingRule[]>(RULES_KEY, []);
}
export function addRule(input: Omit<MappingRule, "id">): MappingRule {
  const rule: MappingRule = {
    ...input,
    id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  };
  write(RULES_KEY, [...getRules(), rule]);
  return rule;
}
export function deleteRule(id: string) {
  write(
    RULES_KEY,
    getRules().filter((r) => r.id !== id),
  );
}

// ---- Resolver --------------------------------------------------------------

function matches(rule: MappingRule, code: string, name: string): boolean {
  const haystack = (rule.field === "code" ? code : name).toLowerCase();
  const needle = rule.pattern.toLowerCase();
  if (!needle) return false;
  switch (rule.match) {
    case "contains":
      return haystack.includes(needle);
    case "startsWith":
      return haystack.startsWith(needle);
    case "endsWith":
      return haystack.endsWith(needle);
    case "equals":
      return haystack === needle;
  }
}

/**
 * Resolve a product to a KF category id.
 * Manual mapping wins; otherwise the first matching rule wins; otherwise null.
 */
export function resolveCategory(
  productCode: string,
  productName: string,
): { kfCategoryId: string; via: "manual" | "rule" | "none"; ruleId?: string } {
  const manual = getProductMappings().find((m) => m.productCode === productCode);
  if (manual) return { kfCategoryId: manual.kfCategoryId, via: "manual" };
  for (const r of getRules()) {
    if (matches(r, productCode, productName)) {
      return { kfCategoryId: r.kfCategoryId, via: "rule", ruleId: r.id };
    }
  }
  return { kfCategoryId: "", via: "none" };
}
