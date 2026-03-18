import { beforeEach, describe, expect, it } from "vitest";
import { calculateSession } from "../services/calculator";
import { createDefaultSalesSpecs, createDefaultSettings, createDefaultShippingRules } from "../services/defaults";
import type { WorkbenchForm } from "../types";
import { exportLocalBackup, resetDefaults, saveProductAndHistory } from "./repositories";

describe("saveProductAndHistory", () => {
  const specs = createDefaultSalesSpecs();
  const shippingRules = createDefaultShippingRules();
  const settings = createDefaultSettings();

  beforeEach(async () => {
    await resetDefaults();
  });

  it("keeps only one history record for the same product name", async () => {
    const buildForm = (unitCost: number): WorkbenchForm => ({
      id: null,
      name: "测试商品A",
      unitLabel: "件",
      unitCost,
      unitWeight: 200,
      selectedSpecIds: [specs[0].id]
    });

    const firstForm = buildForm(10);
    const firstSession = calculateSession({
      form: firstForm,
      settings,
      salesSpecs: specs,
      shippingRules
    });

    await saveProductAndHistory(firstForm, firstSession);

    const secondForm = buildForm(12);
    const secondSession = calculateSession({
      form: secondForm,
      settings,
      salesSpecs: specs,
      shippingRules
    });

    await saveProductAndHistory(secondForm, secondSession);

    const backup = await exportLocalBackup();
    const matched = backup.histories.filter((item) => item.productName === "测试商品A");

    expect(matched).toHaveLength(1);
    expect(matched[0].unitCost).toBe(12);
    expect(backup.products.filter((item) => item.name === "测试商品A")).toHaveLength(1);
  });

  it("treats names with extra whitespace as the same product", async () => {
    const baseForm: WorkbenchForm = {
      id: null,
      name: "测试商品B",
      unitLabel: "袋",
      unitCost: 8,
      unitWeight: 180,
      selectedSpecIds: [specs[1].id]
    };

    await saveProductAndHistory(
      baseForm,
      calculateSession({
        form: baseForm,
        settings,
        salesSpecs: specs,
        shippingRules
      })
    );

    const updatedForm: WorkbenchForm = {
      ...baseForm,
      id: null,
      name: "  测试商品B  ",
      unitCost: 9.5
    };

    await saveProductAndHistory(
      updatedForm,
      calculateSession({
        form: updatedForm,
        settings,
        salesSpecs: specs,
        shippingRules
      })
    );

    const backup = await exportLocalBackup();
    expect(backup.histories.filter((item) => item.productName.trim() === "测试商品B")).toHaveLength(1);
    expect(backup.products.filter((item) => item.name === "测试商品B")).toHaveLength(1);
    expect(backup.products.find((item) => item.name === "测试商品B")?.unitLabel).toBe("袋");
  });
});
