import { createDefaultSalesSpecs, createDefaultSettings, createDefaultShippingRules } from "../services/defaults";
import { backupSchema, productSchema, salesSpecSchema, settingsSchema, shippingRuleSchema } from "../types/schemas";
import { createId } from "../utils/id";
import type {
  AppSettings,
  CalculationHistory,
  CalculationSession,
  LocalBackup,
  Product,
  SalesSpec,
  ShippingRule,
  WorkbenchForm
} from "../types";

type Snapshot = {
  salesSpecs: SalesSpec[];
  shippingRules: ShippingRule[];
  settings: AppSettings | null;
  products: Product[];
  histories: CalculationHistory[];
};

const STORAGE_KEY = "sku-calculator-web-storage";

let memorySnapshot: Snapshot = {
  salesSpecs: [],
  shippingRules: [],
  settings: null,
  products: [],
  histories: []
};

function now() {
  return new Date().toISOString();
}

function normalizeProductName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function byRecent<T extends { createdAt?: string; updatedAt?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const left = a.updatedAt ?? a.createdAt ?? "";
    const right = b.updatedAt ?? b.createdAt ?? "";
    return right.localeCompare(left);
  });
}

function hasLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeSettings(input: AppSettings | null | undefined) {
  return settingsSchema.parse({
    ...createDefaultSettings(),
    ...(input ?? {}),
    updatedAt: input?.updatedAt ?? now()
  });
}

function normalizeHistories(histories: CalculationHistory[]) {
  const defaults = createDefaultSettings();
  return histories.map((history) => ({
    ...history,
    settingsSnapshot: {
      platformFeePercent: history.settingsSnapshot.platformFeePercent,
      packageFeeMode: history.settingsSnapshot.packageFeeMode,
      packageFeeValue: history.settingsSnapshot.packageFeeValue,
      otherFeeMode: history.settingsSnapshot.otherFeeMode,
      otherFeeValue: history.settingsSnapshot.otherFeeValue,
      marketingFeeMode: history.settingsSnapshot.marketingFeeMode ?? defaults.marketingFeeMode,
      marketingFeeValue: history.settingsSnapshot.marketingFeeValue ?? defaults.marketingFeeValue,
      operationFee: history.settingsSnapshot.operationFee,
      targetProfitPercent: history.settingsSnapshot.targetProfitPercent
    },
    items: history.items.map((item) => ({
      ...item,
      marketingFee: item.marketingFee ?? 0
    }))
  }));
}

function readSnapshot(): Snapshot {
  if (!hasLocalStorage()) {
    return structuredClone(memorySnapshot);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {
      salesSpecs: [],
      shippingRules: [],
      settings: null,
      products: [],
      histories: []
    };
  }

  try {
    const parsed = JSON.parse(raw) as Snapshot;
    return {
      salesSpecs: parsed.salesSpecs ?? [],
      shippingRules: parsed.shippingRules ?? [],
      settings: parsed.settings ?? null,
      products: parsed.products ?? [],
      histories: parsed.histories ?? []
    };
  } catch {
    return {
      salesSpecs: [],
      shippingRules: [],
      settings: null,
      products: [],
      histories: []
    };
  }
}

function writeSnapshot(next: Snapshot) {
  memorySnapshot = structuredClone(next);
  if (hasLocalStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}

function getInitializedSnapshot() {
  const snapshot = readSnapshot();
  let changed = false;

  if (snapshot.salesSpecs.length === 0) {
    snapshot.salesSpecs = createDefaultSalesSpecs();
    changed = true;
  }

  if (snapshot.shippingRules.length === 0) {
    snapshot.shippingRules = createDefaultShippingRules();
    changed = true;
  }

  if (!snapshot.settings) {
    snapshot.settings = createDefaultSettings();
    changed = true;
  } else {
    const normalizedSettings = normalizeSettings(snapshot.settings);
    if (JSON.stringify(normalizedSettings) !== JSON.stringify(snapshot.settings)) {
      snapshot.settings = normalizedSettings;
      changed = true;
    }
  }

  const normalizedHistories = normalizeHistories(snapshot.histories);
  if (JSON.stringify(normalizedHistories) !== JSON.stringify(snapshot.histories)) {
    snapshot.histories = normalizedHistories;
    changed = true;
  }

  if (changed) {
    writeSnapshot(snapshot);
  }

  return snapshot;
}

export async function initializeLocalData() {
  getInitializedSnapshot();
}

export async function getBootstrapData() {
  const snapshot = getInitializedSnapshot();
  return {
    salesSpecs: [...snapshot.salesSpecs].sort((a, b) => a.sortNo - b.sortNo || a.quantity - b.quantity),
    shippingRules: [...snapshot.shippingRules].sort(
      (a, b) => a.sortNo - b.sortNo || a.weightMin - b.weightMin
    ),
    settings: snapshot.settings ?? createDefaultSettings(),
    recentProducts: byRecent(snapshot.products).slice(0, 20),
    histories: byRecent(snapshot.histories).slice(0, 100)
  };
}

export async function saveSettings(input: AppSettings) {
  const snapshot = getInitializedSnapshot();
  const nextSettings = normalizeSettings({ ...input, updatedAt: now() });
  snapshot.settings = nextSettings;
  writeSnapshot(snapshot);
  return nextSettings;
}

export async function saveSalesSpec(
  input: Omit<SalesSpec, "createdAt" | "updatedAt"> &
    Partial<Pick<SalesSpec, "createdAt" | "updatedAt">>
) {
  const snapshot = getInitializedSnapshot();
  const timestamp = now();
  const spec = salesSpecSchema.parse({
    ...input,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: timestamp
  });
  snapshot.salesSpecs = [
    ...snapshot.salesSpecs.filter((item) => item.id !== spec.id),
    spec
  ];
  writeSnapshot(snapshot);
  return spec;
}

export async function deleteSalesSpec(id: string) {
  const snapshot = getInitializedSnapshot();
  if (snapshot.salesSpecs.length <= 1) {
    throw new Error("至少保留一个销售规格");
  }
  snapshot.salesSpecs = snapshot.salesSpecs.filter((item) => item.id !== id);
  snapshot.products = snapshot.products.map((product) => ({
    ...product,
    selectedSpecIds: product.selectedSpecIds.filter((item) => item !== id),
    updatedAt: now()
  }));
  writeSnapshot(snapshot);
}

function validateNoOverlap(nextRule: ShippingRule, allRules: ShippingRule[]) {
  const hasOverlap = allRules.some((rule) => {
    if (rule.id === nextRule.id || !rule.enabled || !nextRule.enabled) {
      return false;
    }
    return !(nextRule.weightMax < rule.weightMin || nextRule.weightMin > rule.weightMax);
  });

  if (hasOverlap) {
    throw new Error("重量区间不能重叠");
  }
}

export async function saveShippingRule(
  input: Omit<ShippingRule, "createdAt" | "updatedAt"> &
    Partial<Pick<ShippingRule, "createdAt" | "updatedAt">>
) {
  const snapshot = getInitializedSnapshot();
  const timestamp = now();
  const rule = shippingRuleSchema.parse({
    ...input,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: timestamp
  });
  validateNoOverlap(rule, snapshot.shippingRules);
  snapshot.shippingRules = [
    ...snapshot.shippingRules.filter((item) => item.id !== rule.id),
    rule
  ];
  writeSnapshot(snapshot);
  return rule;
}

export async function deleteShippingRule(id: string) {
  const snapshot = getInitializedSnapshot();
  if (snapshot.shippingRules.length <= 1) {
    throw new Error("至少保留一条运费规则");
  }
  snapshot.shippingRules = snapshot.shippingRules.filter((item) => item.id !== id);
  writeSnapshot(snapshot);
}

export async function saveProduct(input: WorkbenchForm) {
  const snapshot = getInitializedSnapshot();
  const timestamp = now();
  const base = {
    name: input.name.trim(),
    unitCost: input.unitCost ?? 0,
    unitWeight: input.unitWeight ?? 0,
    selectedSpecIds: input.selectedSpecIds
  };

  let productId = input.id;
  if (!productId) {
    const duplicate = snapshot.products.find(
      (item) => normalizeProductName(item.name) === normalizeProductName(base.name)
    );
    productId = duplicate?.id ?? createId();
  }

  const existing = snapshot.products.find((item) => item.id === productId);
  const product = productSchema.parse({
    id: productId,
    ...base,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  });

  snapshot.products = [
    ...snapshot.products.filter((item) => item.id !== product.id),
    product
  ];
  writeSnapshot(snapshot);
  return product;
}

export async function saveHistory(product: Product | null, session: CalculationSession) {
  const snapshot = getInitializedSnapshot();
  const historyNameKey = normalizeProductName(session.productName);
  const existing = snapshot.histories.find(
    (item) => normalizeProductName(item.productName) === historyNameKey
  );
  const history: CalculationHistory = {
    id: existing?.id ?? createId(),
    productId: product?.id ?? null,
    productName: session.productName,
    unitCost: session.unitCost,
    unitWeight: session.unitWeight,
    selectedSpecIds: session.selectedSpecIds,
    selectedQuantities: session.selectedQuantities,
    settingsSnapshot: session.settingsSnapshot,
    items: session.items,
    createdAt: session.createdAt
  };
  snapshot.histories = [
    history,
    ...snapshot.histories.filter(
      (item) => normalizeProductName(item.productName) !== historyNameKey
    )
  ];
  writeSnapshot(snapshot);
  return history;
}

export async function saveProductAndHistory(form: WorkbenchForm, session: CalculationSession) {
  const product = await saveProduct(form);
  const history = await saveHistory(product, session);
  return { product, history };
}

export async function deleteProduct(id: string) {
  const snapshot = getInitializedSnapshot();
  snapshot.products = snapshot.products.filter((item) => item.id !== id);
  snapshot.histories = snapshot.histories.filter((item) => item.productId !== id);
  writeSnapshot(snapshot);
}

export async function deleteHistory(id: string) {
  const snapshot = getInitializedSnapshot();
  snapshot.histories = snapshot.histories.filter((item) => item.id !== id);
  writeSnapshot(snapshot);
}

export async function searchHistories(keyword: string) {
  const snapshot = getInitializedSnapshot();
  const normalized = keyword.trim().toLowerCase();
  return byRecent(
    snapshot.histories.filter((item) =>
      normalized ? item.productName.toLowerCase().includes(normalized) : true
    )
  ).slice(0, 100);
}

export async function ensureSpecsForQuantities(quantities: number[]) {
  const snapshot = getInitializedSnapshot();
  const byQuantity = new Map(snapshot.salesSpecs.map((spec) => [spec.quantity, spec]));
  const timestamp = now();

  for (const quantity of quantities) {
    if (!byQuantity.has(quantity)) {
      const spec: SalesSpec = {
        id: createId(),
        name: `X${quantity}`,
        quantity,
        sortNo: quantity,
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      snapshot.salesSpecs.push(spec);
      byQuantity.set(quantity, spec);
    }
  }

  writeSnapshot(snapshot);
  return snapshot.salesSpecs;
}

export async function exportLocalBackup(): Promise<LocalBackup> {
  const snapshot = getInitializedSnapshot();
  return backupSchema.parse({
    version: 1,
    exportedAt: now(),
    salesSpecs: snapshot.salesSpecs,
    shippingRules: snapshot.shippingRules,
    settings: snapshot.settings ?? createDefaultSettings(),
    products: snapshot.products,
    histories: snapshot.histories
  });
}

export async function importLocalBackup(payload: LocalBackup) {
  const parsed = backupSchema.parse(payload);
  writeSnapshot({
    salesSpecs: parsed.salesSpecs,
    shippingRules: parsed.shippingRules,
    settings: normalizeSettings(parsed.settings),
    products: parsed.products,
    histories: normalizeHistories(parsed.histories)
  });
}

export async function clearProducts() {
  const snapshot = getInitializedSnapshot();
  snapshot.products = [];
  writeSnapshot(snapshot);
}

export async function clearHistories() {
  const snapshot = getInitializedSnapshot();
  snapshot.histories = [];
  writeSnapshot(snapshot);
}

export async function resetDefaults() {
  writeSnapshot({
    salesSpecs: createDefaultSalesSpecs(),
    shippingRules: createDefaultShippingRules(),
    settings: createDefaultSettings(),
    products: [],
    histories: []
  });
}
