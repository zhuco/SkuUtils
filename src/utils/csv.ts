import type { CalculationResult } from "../types";

function escapeCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function resultsToCsv(items: CalculationResult[]) {
  const rows: Array<Array<string | number>> = [
    [
      "规格",
      "数量",
      "商品成本",
      "总重量(g)",
      "运费",
      "包装",
      "其它",
      "营销",
      "运营",
      "总成本",
      "最终建议售价",
      "平台扣点",
      "预计利润",
      "毛利率(%)",
      "保本ROI"
    ]
  ];

  items.forEach((item) => {
    rows.push([
      item.specName,
      item.specQuantity,
      item.goodsCost,
      item.totalWeight,
      item.shippingFee,
      item.packageFee,
      item.otherFee,
      item.marketingFee,
      item.operationFee,
      item.totalCost,
      item.finalSuggestedPrice,
      item.platformFee,
      item.estimatedProfit,
      item.profitRate,
      item.breakEvenRoi
    ]);
  });

  return rows.map((row) => row.map(escapeCell).join(",")).join("\n");
}

export function downloadTextFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
