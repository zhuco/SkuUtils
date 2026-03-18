import Decimal from "decimal.js";
import type {
  AppSettings,
  CalculationResult,
  CalculationSession,
  SalesSpec,
  ShippingRule,
  WorkbenchForm
} from "../types";
import { workbenchSchema } from "../types/schemas";

const money = (value: Decimal.Value) =>
  new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

const ratioPercent = (value: Decimal.Value) =>
  new Decimal(value).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

function normalizeRate(percent: number) {
  return new Decimal(percent).div(100);
}

function matchShippingRule(weight: Decimal, rules: ShippingRule[]) {
  const activeRules = rules
    .filter((rule) => rule.enabled)
    .sort((a, b) => a.sortNo - b.sortNo || a.weightMin - b.weightMin);

  return (
    activeRules.find((rule) => weight.gte(rule.weightMin) && weight.lte(rule.weightMax)) ?? null
  );
}

export function calculateSession(input: {
  form: WorkbenchForm;
  settings: AppSettings;
  salesSpecs: SalesSpec[];
  shippingRules: ShippingRule[];
}): CalculationSession {
  const parsed = workbenchSchema.parse(input.form);
  const selectedSpecs = input.salesSpecs
    .filter((spec) => spec.enabled && parsed.selectedSpecIds.includes(spec.id))
    .sort((a, b) => a.sortNo - b.sortNo || a.quantity - b.quantity);

  const platformRate = normalizeRate(input.settings.platformFeePercent);
  const packagePercent =
    input.settings.packageFeeMode === "percent"
      ? normalizeRate(input.settings.packageFeeValue)
      : new Decimal(0);
  const otherPercent =
    input.settings.otherFeeMode === "percent"
      ? normalizeRate(input.settings.otherFeeValue)
      : new Decimal(0);
  const marketingPercent =
    input.settings.marketingFeeMode === "percent"
      ? normalizeRate(input.settings.marketingFeeValue)
      : new Decimal(0);
  const targetProfitRate = normalizeRate(input.settings.targetProfitPercent);
  const denominator = new Decimal(1)
    .minus(platformRate)
    .minus(packagePercent)
    .minus(otherPercent)
    .minus(marketingPercent)
    .minus(targetProfitRate);

  const items: CalculationResult[] = selectedSpecs.map((spec) => {
    const specQuantity = new Decimal(spec.quantity);
    const goodsCost = new Decimal(parsed.unitCost).times(specQuantity);
    const totalWeight = new Decimal(parsed.unitWeight).times(specQuantity);
    const shippingRule = matchShippingRule(totalWeight, input.shippingRules);
    const shippingFee = new Decimal(shippingRule?.shippingFee ?? 0);
    const packageFeeFixed =
      input.settings.packageFeeMode === "fixed"
        ? new Decimal(input.settings.packageFeeValue)
        : new Decimal(0);
    const otherFeeFixed =
      input.settings.otherFeeMode === "fixed"
        ? new Decimal(input.settings.otherFeeValue)
        : new Decimal(0);
    const marketingFeeFixed =
      input.settings.marketingFeeMode === "fixed"
        ? new Decimal(input.settings.marketingFeeValue)
        : new Decimal(0);
    const operationFee = new Decimal(input.settings.operationFee);

    const fixedCostBase = goodsCost
      .plus(shippingFee)
      .plus(operationFee)
      .plus(packageFeeFixed)
      .plus(otherFeeFixed)
      .plus(marketingFeeFixed);

    const rawSuggestedPrice = denominator.gt(0) ? fixedCostBase.div(denominator) : new Decimal(0);
    const finalSuggestedPrice = rawSuggestedPrice.gt(0)
      ? Decimal.max(rawSuggestedPrice.ceil().minus(0.1), 0.1)
      : new Decimal(0);
    const packageFee =
      input.settings.packageFeeMode === "fixed"
        ? packageFeeFixed
        : finalSuggestedPrice.times(packagePercent);
    const otherFee =
      input.settings.otherFeeMode === "fixed"
        ? otherFeeFixed
        : finalSuggestedPrice.times(otherPercent);
    const marketingFee =
      input.settings.marketingFeeMode === "fixed"
        ? marketingFeeFixed
        : finalSuggestedPrice.times(marketingPercent);
    const platformFee = finalSuggestedPrice.times(platformRate);
    const totalCost = goodsCost
      .plus(shippingFee)
      .plus(packageFee)
      .plus(otherFee)
      .plus(marketingFee)
      .plus(operationFee);
    const estimatedProfit = finalSuggestedPrice.minus(totalCost).minus(platformFee);
    const profitRate = finalSuggestedPrice.gt(0)
      ? estimatedProfit.div(finalSuggestedPrice)
      : new Decimal(0);
    const breakEvenRoi = profitRate.gt(0) ? new Decimal(1).div(profitRate) : new Decimal(0);

    return {
      specName: `${spec.name}${parsed.unitLabel}`,
      specQuantity: spec.quantity,
      goodsCost: money(goodsCost),
      totalWeight: money(totalWeight),
      shippingFee: money(shippingFee),
      packageFee: money(packageFee),
      otherFee: money(otherFee),
      marketingFee: money(marketingFee),
      operationFee: money(operationFee),
      totalCost: money(totalCost),
      finalSuggestedPrice: money(finalSuggestedPrice),
      platformFee: money(platformFee),
      estimatedProfit: money(estimatedProfit),
      profitRate: ratioPercent(profitRate),
      breakEvenRoi: money(breakEvenRoi)
    };
  });

  return {
    productName: parsed.name,
    unitLabel: parsed.unitLabel,
    unitCost: parsed.unitCost,
    unitWeight: parsed.unitWeight,
    selectedSpecIds: parsed.selectedSpecIds,
    selectedQuantities: selectedSpecs.map((spec) => spec.quantity),
    settingsSnapshot: {
      platformFeePercent: input.settings.platformFeePercent,
      packageFeeMode: input.settings.packageFeeMode,
      packageFeeValue: input.settings.packageFeeValue,
      otherFeeMode: input.settings.otherFeeMode,
      otherFeeValue: input.settings.otherFeeValue,
      marketingFeeMode: input.settings.marketingFeeMode,
      marketingFeeValue: input.settings.marketingFeeValue,
      operationFee: input.settings.operationFee,
      targetProfitPercent: input.settings.targetProfitPercent
    },
    items,
    createdAt: new Date().toISOString()
  };
}
