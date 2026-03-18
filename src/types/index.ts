export type FeeMode = "fixed" | "percent";

export type SalesSpec = {
  id: string;
  name: string;
  quantity: number;
  sortNo: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ShippingRule = {
  id: string;
  weightMin: number;
  weightMax: number;
  shippingFee: number;
  sortNo: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  id: "app";
  platformFeePercent: number;
  packageFeeMode: FeeMode;
  packageFeeValue: number;
  otherFeeMode: FeeMode;
  otherFeeValue: number;
  marketingFeeMode: FeeMode;
  marketingFeeValue: number;
  operationFee: number;
  targetProfitPercent: number;
  updatedAt: string;
};

export type Product = {
  id: string;
  name: string;
  unitCost: number;
  unitWeight: number;
  selectedSpecIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CalculationResult = {
  specName: string;
  specQuantity: number;
  goodsCost: number;
  totalWeight: number;
  shippingFee: number;
  packageFee: number;
  otherFee: number;
  marketingFee: number;
  operationFee: number;
  totalCost: number;
  finalSuggestedPrice: number;
  platformFee: number;
  estimatedProfit: number;
  profitRate: number;
  breakEvenRoi: number;
};

export type SettingsSnapshot = Omit<AppSettings, "id" | "updatedAt">;

export type CalculationHistory = {
  id: string;
  productId: string | null;
  productName: string;
  unitCost: number;
  unitWeight: number;
  selectedSpecIds: string[];
  selectedQuantities: number[];
  settingsSnapshot: SettingsSnapshot;
  items: CalculationResult[];
  createdAt: string;
};

export type WorkbenchForm = {
  id: string | null;
  name: string;
  unitCost: number | null;
  unitWeight: number | null;
  selectedSpecIds: string[];
};

export type CalculationSession = {
  productName: string;
  unitCost: number;
  unitWeight: number;
  selectedSpecIds: string[];
  selectedQuantities: number[];
  settingsSnapshot: SettingsSnapshot;
  items: CalculationResult[];
  createdAt: string;
};

export type LocalBackup = {
  version: 1;
  exportedAt: string;
  salesSpecs: SalesSpec[];
  shippingRules: ShippingRule[];
  settings: AppSettings;
  products: Product[];
  histories: CalculationHistory[];
};
