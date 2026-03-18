import { describe, expect, it } from "vitest";
import { calculateSession } from "./calculator";
import { createDefaultSalesSpecs, createDefaultSettings, createDefaultShippingRules } from "./defaults";
import type { WorkbenchForm } from "../types";

describe("calculateSession", () => {
  const specs = createDefaultSalesSpecs();
  const rules = createDefaultShippingRules();
  const settings = createDefaultSettings();

  const form: WorkbenchForm = {
    id: null,
    name: "测试商品",
    unitLabel: "件",
    unitCost: 8.7,
    unitWeight: 240,
    selectedSpecIds: [specs[0].id, specs[1].id]
  };

  it("calculates base pricing using default fixed fees", () => {
    const result = calculateSession({
      form,
      settings,
      salesSpecs: specs,
      shippingRules: rules
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].specName).toBe("X1件");
    expect(result.items[0].shippingFee).toBe(1.5);
    expect(result.items[0].finalSuggestedPrice).toBeGreaterThan(0);
  });

  it("supports percent-based package and other fees", () => {
    const result = calculateSession({
      form,
      settings: {
        ...settings,
        packageFeeMode: "percent",
        packageFeeValue: 3,
        otherFeeMode: "percent",
        otherFeeValue: 2,
        marketingFeeMode: "percent",
        marketingFeeValue: 5
      },
      salesSpecs: specs,
      shippingRules: rules
    });

    expect(result.items[0].packageFee).toBeGreaterThan(0);
    expect(result.items[0].otherFee).toBeGreaterThan(0);
    expect(result.items[0].marketingFee).toBeGreaterThan(0);
    expect(result.items[0].totalCost).toBeGreaterThan(result.items[0].goodsCost);
  });

  it("supports fixed marketing fee", () => {
    const result = calculateSession({
      form: {
        ...form,
        selectedSpecIds: [specs[0].id]
      },
      settings: {
        ...settings,
        packageFeeMode: "fixed",
        packageFeeValue: 0,
        otherFeeMode: "fixed",
        otherFeeValue: 0,
        marketingFeeMode: "fixed",
        marketingFeeValue: 2.5,
        operationFee: 0
      },
      salesSpecs: specs,
      shippingRules: rules
    });

    expect(result.items[0].marketingFee).toBe(2.5);
    expect(result.items[0].totalCost).toBe(
      result.items[0].goodsCost + result.items[0].shippingFee + result.items[0].marketingFee
    );
  });

  it("returns zero shipping when no rule matches", () => {
    const result = calculateSession({
      form: {
        ...form,
        selectedSpecIds: [specs[specs.length - 1].id]
      },
      settings,
      salesSpecs: specs,
      shippingRules: [
        {
          ...rules[0],
          weightMin: 0,
          weightMax: 50
        }
      ]
    });

    expect(result.items[0].shippingFee).toBe(0);
  });

  it("keeps pricing rule as ceil minus 0.1", () => {
    const result = calculateSession({
      form: {
        ...form,
        unitCost: 10,
        selectedSpecIds: [specs[0].id]
      },
      settings: {
        ...settings,
        platformFeePercent: 0,
        packageFeeMode: "fixed",
        packageFeeValue: 0,
        otherFeeMode: "fixed",
        otherFeeValue: 0,
        marketingFeeMode: "fixed",
        marketingFeeValue: 0,
        operationFee: 0,
        targetProfitPercent: 50
      },
      salesSpecs: specs,
      shippingRules: rules
    });

    expect(result.items[0].finalSuggestedPrice).toBe(22.9);
  });
});
