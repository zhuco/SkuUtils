import type { AppSettings, SalesSpec, ShippingRule } from "../types";
import { createId } from "../utils/id";

function now() {
  return new Date().toISOString();
}

export function createDefaultSalesSpecs(): SalesSpec[] {
  const timestamp = now();
  return [1, 3, 5, 10, 20, 30, 50, 100].map((quantity, index) => ({
    id: createId(),
    name: `X${quantity}`,
    quantity,
    sortNo: (index + 1) * 10,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp
  }));
}

export function createDefaultShippingRules(): ShippingRule[] {
  const timestamp = now();
  return [
    [0, 450, 1.5, 10],
    [451, 900, 1.8, 20],
    [901, 1800, 2.1, 30],
    [1801, 2600, 2.6, 40],
    [2601, 4500, 5.0, 50]
  ].map(([weightMin, weightMax, shippingFee, sortNo]) => ({
    id: createId(),
    weightMin,
    weightMax,
    shippingFee,
    sortNo,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp
  }));
}

export function createDefaultSettings(): AppSettings {
  return {
    id: "app",
    platformFeePercent: 8,
    packageFeeMode: "fixed",
    packageFeeValue: 0.5,
    otherFeeMode: "fixed",
    otherFeeValue: 0,
    marketingFeeMode: "percent",
    marketingFeeValue: 5,
    operationFee: 0.8,
    targetProfitPercent: 25,
    updatedAt: now()
  };
}
