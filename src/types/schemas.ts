import { z } from "zod";

const unitLabelSchema = z.enum(["件", "包", "袋", "箱", "克", "千克", "份"]).default("件");

export const workbenchSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "商品名称不能为空"),
  unitLabel: unitLabelSchema,
  unitCost: z.number({ message: "单件成本不能为空" }).min(0, "单件成本不能小于 0"),
  unitWeight: z
    .number({ message: "单件重量不能为空" })
    .positive("单件重量必须大于 0"),
  selectedSpecIds: z.array(z.string()).min(1, "至少选择一个销售规格")
});

export const settingsSchema = z.object({
  id: z.literal("app"),
  platformFeePercent: z
    .number()
    .min(0, "平台扣点不能小于 0")
    .max(100, "平台扣点不能大于 100"),
  packageFeeMode: z.enum(["fixed", "percent"]),
  packageFeeValue: z.number().min(0, "包装成本不能小于 0"),
  otherFeeMode: z.enum(["fixed", "percent"]),
  otherFeeValue: z.number().min(0, "其它成本不能小于 0"),
  marketingFeeMode: z.enum(["fixed", "percent"]).default("percent"),
  marketingFeeValue: z.number().min(0, "营销费用不能小于 0").default(5),
  operationFee: z.number().min(0, "运营费用不能小于 0"),
  targetProfitPercent: z
    .number()
    .min(0, "目标毛利率不能小于 0")
    .max(100, "目标毛利率不能大于 100"),
  updatedAt: z.string()
});

export const salesSpecSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "规格名称不能为空"),
  quantity: z.number().int().positive("规格数量必须大于 0"),
  sortNo: z.number().int().nonnegative("排序号不能小于 0"),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const shippingRuleSchema = z
  .object({
    id: z.string(),
    weightMin: z.number().min(0, "最小重量不能小于 0"),
    weightMax: z.number().positive("最大重量必须大于 0"),
    shippingFee: z.number().min(0, "运费不能为负数"),
    sortNo: z.number().int().nonnegative("排序号不能小于 0"),
    enabled: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string()
  })
  .refine((value) => value.weightMax > value.weightMin, {
    message: "最大重量必须大于最小重量",
    path: ["weightMax"]
  });

export const productSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "商品名称不能为空"),
  unitLabel: unitLabelSchema,
  unitCost: z.number().min(0, "单件成本不能小于 0"),
  unitWeight: z.number().positive("单件重量必须大于 0"),
  selectedSpecIds: z.array(z.string()).min(1, "至少保留一个规格"),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const calculationResultSchema = z.object({
  specName: z.string(),
  specQuantity: z.number(),
  goodsCost: z.number(),
  totalWeight: z.number(),
  shippingFee: z.number(),
  packageFee: z.number(),
  otherFee: z.number(),
  marketingFee: z.number().default(0),
  operationFee: z.number(),
  totalCost: z.number(),
  finalSuggestedPrice: z.number(),
  platformFee: z.number(),
  estimatedProfit: z.number(),
  profitRate: z.number(),
  breakEvenRoi: z.number()
});

export const historySchema = z.object({
  id: z.string(),
  productId: z.string().nullable(),
  productName: z.string(),
  unitLabel: unitLabelSchema,
  unitCost: z.number(),
  unitWeight: z.number(),
  selectedSpecIds: z.array(z.string()),
  selectedQuantities: z.array(z.number()),
  settingsSnapshot: settingsSchema.omit({ id: true, updatedAt: true }),
  items: z.array(calculationResultSchema),
  createdAt: z.string()
});

export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  salesSpecs: z.array(salesSpecSchema),
  shippingRules: z.array(shippingRuleSchema),
  settings: settingsSchema,
  products: z.array(productSchema),
  histories: z.array(historySchema)
});
