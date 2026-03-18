import Dexie, { type Table } from "dexie";
import type { AppSettings, CalculationHistory, Product, SalesSpec, ShippingRule } from "../types";

export class SkuCalculatorDb extends Dexie {
  salesSpecs!: Table<SalesSpec, string>;
  shippingRules!: Table<ShippingRule, string>;
  settings!: Table<AppSettings, "app">;
  products!: Table<Product, string>;
  histories!: Table<CalculationHistory, string>;

  constructor() {
    super("sku-calculator-web-db");

    this.version(1).stores({
      salesSpecs: "id, quantity, sortNo, updatedAt",
      shippingRules: "id, weightMin, weightMax, sortNo, updatedAt",
      settings: "id",
      products: "id, name, updatedAt",
      histories: "id, productName, createdAt"
    });
  }
}

export const db = new SkuCalculatorDb();
