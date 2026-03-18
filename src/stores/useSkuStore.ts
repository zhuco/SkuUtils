import { create } from "zustand";
import {
  clearHistories,
  clearProducts,
  deleteHistory,
  deleteProduct,
  deleteSalesSpec,
  deleteShippingRule,
  ensureSpecsForQuantities,
  exportLocalBackup,
  getBootstrapData,
  importLocalBackup,
  resetDefaults,
  saveProductAndHistory,
  saveSalesSpec,
  saveSettings,
  saveShippingRule,
  searchHistories
} from "../db/repositories";
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

type StoreState = {
  ready: boolean;
  initError: string | null;
  specs: SalesSpec[];
  shippingRules: ShippingRule[];
  settings: AppSettings | null;
  recentProducts: Product[];
  histories: CalculationHistory[];
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  saveSettings: (input: AppSettings) => Promise<void>;
  saveSpec: (input: SalesSpec) => Promise<void>;
  removeSpec: (id: string) => Promise<void>;
  saveRule: (input: ShippingRule) => Promise<void>;
  removeRule: (id: string) => Promise<void>;
  saveProductAndHistory: (form: WorkbenchForm, session: CalculationSession) => Promise<void>;
  removeProduct: (id: string) => Promise<void>;
  removeHistory: (id: string) => Promise<void>;
  filterHistories: (keyword: string) => Promise<void>;
  exportBackup: () => Promise<LocalBackup>;
  importBackup: (payload: LocalBackup) => Promise<void>;
  clearProducts: () => Promise<void>;
  clearHistories: () => Promise<void>;
  resetDefaults: () => Promise<void>;
  ensureSpecsForQuantities: (quantities: number[]) => Promise<void>;
};

export const useSkuStore = create<StoreState>((set) => ({
  ready: false,
  initError: null,
  specs: [],
  shippingRules: [],
  settings: null,
  recentProducts: [],
  histories: [],
  initialize: async () => {
    try {
      const data = await getBootstrapData();
      set({
        ready: true,
        initError: null,
        specs: data.salesSpecs,
        shippingRules: data.shippingRules,
        settings: data.settings,
        recentProducts: data.recentProducts,
        histories: data.histories
      });
    } catch (error) {
      set({
        ready: true,
        initError: error instanceof Error ? error.message : "初始化失败",
        specs: [],
        shippingRules: [],
        settings: null,
        recentProducts: [],
        histories: []
      });
    }
  },
  refresh: async () => {
    const data = await getBootstrapData();
    set({
      specs: data.salesSpecs,
      shippingRules: data.shippingRules,
      settings: data.settings,
      recentProducts: data.recentProducts,
      histories: data.histories
    });
  },
  saveSettings: async (input) => {
    await saveSettings(input);
    const data = await getBootstrapData();
    set({ settings: data.settings });
  },
  saveSpec: async (input) => {
    await saveSalesSpec(input);
    const data = await getBootstrapData();
    set({ specs: data.salesSpecs, recentProducts: data.recentProducts });
  },
  removeSpec: async (id) => {
    await deleteSalesSpec(id);
    const data = await getBootstrapData();
    set({ specs: data.salesSpecs, recentProducts: data.recentProducts });
  },
  saveRule: async (input) => {
    await saveShippingRule(input);
    const data = await getBootstrapData();
    set({ shippingRules: data.shippingRules });
  },
  removeRule: async (id) => {
    await deleteShippingRule(id);
    const data = await getBootstrapData();
    set({ shippingRules: data.shippingRules });
  },
  saveProductAndHistory: async (form, session) => {
    await saveProductAndHistory(form, session);
    const data = await getBootstrapData();
    set({ recentProducts: data.recentProducts, histories: data.histories });
  },
  removeProduct: async (id) => {
    await deleteProduct(id);
    const data = await getBootstrapData();
    set({ recentProducts: data.recentProducts, histories: data.histories });
  },
  removeHistory: async (id) => {
    await deleteHistory(id);
    const data = await getBootstrapData();
    set({ histories: data.histories });
  },
  filterHistories: async (keyword) => {
    const histories = await searchHistories(keyword);
    set({ histories });
  },
  exportBackup: async () => exportLocalBackup(),
  importBackup: async (payload) => {
    await importLocalBackup(payload);
    const data = await getBootstrapData();
    set({
      specs: data.salesSpecs,
      shippingRules: data.shippingRules,
      settings: data.settings,
      recentProducts: data.recentProducts,
      histories: data.histories
    });
  },
  clearProducts: async () => {
    await clearProducts();
    const data = await getBootstrapData();
    set({ recentProducts: data.recentProducts });
  },
  clearHistories: async () => {
    await clearHistories();
    const data = await getBootstrapData();
    set({ histories: data.histories });
  },
  resetDefaults: async () => {
    await resetDefaults();
    const data = await getBootstrapData();
    set({
      specs: data.salesSpecs,
      shippingRules: data.shippingRules,
      settings: data.settings
    });
  },
  ensureSpecsForQuantities: async (quantities) => {
    await ensureSpecsForQuantities(quantities);
    const data = await getBootstrapData();
    set({ specs: data.salesSpecs });
  }
}));
