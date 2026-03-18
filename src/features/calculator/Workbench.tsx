import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography
} from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateSession } from "../../services/calculator";
import { parseBackup, serializeBackup } from "../../services/importExport";
import { useSkuStore } from "../../stores/useSkuStore";
import type {
  AppSettings,
  CalculationHistory,
  CalculationResult,
  CalculationSession,
  Product,
  SalesSpec,
  WorkbenchForm
} from "../../types";
import { workbenchSchema } from "../../types/schemas";
import { downloadTextFile, resultsToCsv } from "../../utils/csv";
import { createId } from "../../utils/id";
import { formatMoney, formatPercent, formatWeight, getErrorMessage } from "../../utils/format";
import { emptyWorkbenchForm, mergeWorkbenchForm } from "./formState";
import { HistoryDrawer } from "../history/HistoryDrawer";
import { RecentProducts } from "../products/RecentProducts";
import { SettingsDrawer } from "../settings/SettingsDrawer";

function buildSpecName(quantity: number) {
  return `X${quantity}`;
}

function resultsToClipboardText(items: CalculationResult[]) {
  const header = [
    "规格",
    "数量",
    "商品成本",
    "总重量",
    "运费",
    "包装",
    "其它",
    "营销",
    "运营",
    "总成本",
    "最终建议售价",
    "平台扣点",
    "预计利润",
    "毛利率",
    "保本ROI"
  ].join("\t");
  const lines = items.map((item) =>
    [
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
    ].join("\t")
  );
  return [header, ...lines].join("\n");
}

export function Workbench() {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<WorkbenchForm>();
  const importRef = useRef<HTMLInputElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [formState, setFormState] = useState<WorkbenchForm>(emptyWorkbenchForm);
  const [customSpecQuantity, setCustomSpecQuantity] = useState<number | null>(null);
  const [session, setSession] = useState<CalculationSession | null>(null);

  const {
    ready,
    initError,
    specs,
    shippingRules,
    settings,
    recentProducts,
    histories,
    initialize,
    saveSettings,
    saveSpec,
    removeSpec,
    saveRule,
    removeRule,
    saveProductAndHistory,
    removeProduct,
    removeHistory,
    filterHistories,
    exportBackup,
    importBackup,
    clearProducts,
    clearHistories,
    resetDefaults,
    ensureSpecsForQuantities
  } = useSkuStore();

  useEffect(() => {
    initialize().catch((error) => {
      message.error(getErrorMessage(error));
    });
  }, [initialize, message]);

  useEffect(() => {
    if (!ready || specs.length === 0) {
      return;
    }
    if (formState.selectedSpecIds.length === 0) {
      const defaults = specs.filter((item) => item.enabled).slice(0, 3).map((item) => item.id);
      setFormState((current) => ({ ...current, selectedSpecIds: defaults }));
      form.setFieldsValue({ ...form.getFieldsValue(), selectedSpecIds: defaults });
    }
  }, [form, formState.selectedSpecIds.length, ready, specs]);

  const selectedHistory = useMemo(
    () => histories.find((item) => item.id === selectedHistoryId) ?? null,
    [histories, selectedHistoryId]
  );

  const activeSettings = settings as AppSettings;

  function syncForm(next: Partial<WorkbenchForm>) {
    setFormState((current) => {
      const merged = mergeWorkbenchForm(current, next);
      form.setFieldsValue(merged);
      return merged;
    });
  }

  function runCalculation(nextForm?: WorkbenchForm) {
    const payload = nextForm ?? formState;
    const normalized: WorkbenchForm = {
      ...payload,
      name: payload.name.trim(),
      unitCost: payload.unitCost === null ? null : Number(payload.unitCost),
      unitWeight: payload.unitWeight === null ? null : Number(payload.unitWeight),
      selectedSpecIds: payload.selectedSpecIds
    };
    const parsed = workbenchSchema.parse({
      ...normalized,
      unitCost: normalized.unitCost ?? undefined,
      unitWeight: normalized.unitWeight ?? undefined
    });
    const result = calculateSession({
      form: parsed,
      settings: activeSettings,
      salesSpecs: specs,
      shippingRules
    });
    setSession(result);
    return { parsed, result };
  }

  async function handleCalculateOnly() {
    try {
      runCalculation();
      message.success("计算完成");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function handleSaveAndCalculate() {
    try {
      const { parsed, result } = runCalculation();
      await saveProductAndHistory(parsed, result);
      syncForm({ id: parsed.id });
      await filterHistories("");
      message.success("商品和历史已保存");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function handleAddCustomSpec() {
    if (!customSpecQuantity || customSpecQuantity <= 0) {
      message.warning("请输入大于 0 的规格数量");
      return;
    }
    const existing = specs.find((spec) => spec.quantity === customSpecQuantity);
    const specId = existing?.id ?? createId();
    try {
      await saveSpec({
        id: specId,
        name: buildSpecName(customSpecQuantity),
        quantity: customSpecQuantity,
        sortNo: customSpecQuantity,
        enabled: true,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      syncForm({
        selectedSpecIds: Array.from(new Set([...formState.selectedSpecIds, specId]))
      });
      setCustomSpecQuantity(null);
      message.success("规格已添加");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function handleLoadProduct(product: Product) {
    const nextForm: WorkbenchForm = {
      id: product.id,
      name: product.name,
      unitCost: product.unitCost,
      unitWeight: product.unitWeight,
      selectedSpecIds: product.selectedSpecIds
    };
    syncForm(nextForm);
    try {
      runCalculation(nextForm);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function handleLoadHistory(history: CalculationHistory) {
    try {
      await ensureSpecsForQuantities(history.selectedQuantities);
      const latestSpecs = useSkuStore.getState().specs;
      const quantityMap = new Map(latestSpecs.map((spec) => [spec.quantity, spec.id]));
      const nextForm: WorkbenchForm = {
        id: history.productId,
        name: history.productName,
        unitCost: history.unitCost,
        unitWeight: history.unitWeight,
        selectedSpecIds: history.selectedQuantities
          .map((quantity) => quantityMap.get(quantity))
          .filter(Boolean) as string[]
      };
      syncForm(nextForm);
      runCalculation(nextForm);
      setHistoryOpen(false);
      message.success("已按历史记录回填并重新计算");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function handleCopyAll() {
    if (!session) {
      message.warning("当前没有结果可复制");
      return;
    }
    await navigator.clipboard.writeText(resultsToClipboardText(session.items));
    message.success("结果表已复制");
  }

  async function handleExportCsv() {
    if (!session) {
      message.warning("当前没有结果可导出");
      return;
    }
    const csv = resultsToCsv(session.items);
    downloadTextFile(`\ufeff${csv}`, `${session.productName || "sku-results"}.csv`, "text/csv;charset=utf-8");
  }

  async function handleExportBackup() {
    try {
      const payload = await exportBackup();
      downloadTextFile(
        serializeBackup(payload),
        `sku-calculator-backup-${new Date().toISOString().slice(0, 10)}.json`,
        "application/json;charset=utf-8"
      );
      message.success("本地数据已导出");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function handleImportBackup(file: File) {
    try {
      const raw = await file.text();
      const parsed = parseBackup(raw);
      await importBackup(parsed);
      setSession(null);
      syncForm(emptyWorkbenchForm);
      message.success("本地数据已导入");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  if (!ready) {
    return <Card loading title="SKU 计算器 Web 版" />;
  }

  if (initError || !settings) {
    return (
      <Card title="SKU 计算器 Web 版">
        <Alert
          type="error"
          showIcon
          message="本地数据初始化失败"
          description={initError ?? "当前浏览器无法正常使用本地存储，请尝试更换浏览器或关闭隐私限制。"}
        />
      </Card>
    );
  }

  return (
    <>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card
          title="SKU计算器"
          extra={
            <Space wrap>
              <Button onClick={() => setSettingsOpen(true)}>设置</Button>
              <Button onClick={() => setHistoryOpen(true)}>历史记录</Button>
              <Button onClick={handleExportBackup}>导出本地数据</Button>
              <Button onClick={() => importRef.current?.click()}>导入本地数据</Button>
              <Button onClick={handleCalculateOnly}>仅计算</Button>
              <Button type="primary" onClick={handleSaveAndCalculate}>
                添加并保存
              </Button>
              <Button
                onClick={() => {
                  syncForm(emptyWorkbenchForm);
                  setSession(null);
                }}
              >
                清空当前表单
              </Button>
            </Space>
          }
        >
          <input
            ref={importRef}
            hidden
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImportBackup(file);
              }
              event.currentTarget.value = "";
            }}
          />
          <Row gutter={[16, 16]}>
            <Col xs={24} xxl={18}>
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card size="small" title="商品基础信息">
                  <Form
                    form={form}
                    layout="vertical"
                    initialValues={formState}
                    onValuesChange={(_, allValues: Partial<WorkbenchForm>) =>
                      setFormState((current) => mergeWorkbenchForm(current, allValues))
                    }
                  >
                    <Row gutter={16}>
                      <Col xs={24} md={10}>
                        <Form.Item label="商品名称" name="name">
                          <Input data-testid="product-name" placeholder="请输入商品名称" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={7}>
                        <Form.Item label="单件成本" name="unitCost">
                          <InputNumber
                            data-testid="unit-cost"
                            min={0}
                            precision={2}
                            style={{ width: "100%" }}
                            placeholder="0.00"
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={7}>
                        <Form.Item label="单件重量(g)" name="unitWeight">
                          <InputNumber
                            data-testid="unit-weight"
                            min={0}
                            precision={0}
                            style={{ width: "100%" }}
                            placeholder="请输入克重"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Form>
                </Card>

                <Card
                  size="small"
                  title="销售规格"
                  extra={
                    <Space>
                      <InputNumber
                        min={1}
                        value={customSpecQuantity}
                        onChange={(value) => setCustomSpecQuantity(value)}
                        placeholder="新增规格数量"
                      />
                      <Button onClick={handleAddCustomSpec}>添加规格</Button>
                    </Space>
                  }
                >
                  <div className="spec-grid">
                    {specs
                      .slice()
                      .sort((a, b) => a.sortNo - b.sortNo || a.quantity - b.quantity)
                      .map((spec) => {
                        const active = formState.selectedSpecIds.includes(spec.id);
                        return (
                          <Card
                            key={spec.id}
                            size="small"
                            className={active ? "spec-card spec-card-active" : "spec-card"}
                            onClick={() =>
                              syncForm({
                                selectedSpecIds: active
                                  ? formState.selectedSpecIds.filter((item) => item !== spec.id)
                                  : [...formState.selectedSpecIds, spec.id]
                              })
                            }
                          >
                            <Space direction="vertical" size={6} style={{ width: "100%" }}>
                              <Space style={{ justifyContent: "space-between", width: "100%" }}>
                                <Typography.Text strong>{spec.name}</Typography.Text>
                                {!spec.enabled ? <Tag color="default">停用</Tag> : null}
                              </Space>
                              <Typography.Text type="secondary">{spec.quantity} 件</Typography.Text>
                              <Space>
                                <Button
                                  size="small"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void saveSpec({ ...spec, enabled: !spec.enabled }).catch((error) =>
                                      message.error(getErrorMessage(error))
                                    );
                                  }}
                                >
                                  {spec.enabled ? "停用" : "启用"}
                                </Button>
                                <Button
                                  danger
                                  size="small"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void removeSpec(spec.id).catch((error) =>
                                      message.error(getErrorMessage(error))
                                    );
                                  }}
                                >
                                  删除
                                </Button>
                              </Space>
                            </Space>
                          </Card>
                        );
                      })}
                  </div>
                </Card>

                <Card
                  size="small"
                  title="计算结果"
                  extra={
                    <Space>
                      <Button onClick={handleCopyAll}>复制整个结果表</Button>
                      <Button onClick={handleExportCsv}>导出 CSV</Button>
                    </Space>
                  }
                >
                  <Table
                    data-testid="calculation-table"
                    rowKey={(row) => row.specName}
                    pagination={false}
                    scroll={{ x: 1100 }}
                    locale={{ emptyText: "点击“仅计算”或“添加并保存”后显示结果" }}
                    dataSource={session?.items ?? []}
                    columns={[
                      { title: "规格", dataIndex: "specName", width: 90 },
                      { title: "商品成本", dataIndex: "goodsCost", render: formatMoney },
                      { title: "总重量", dataIndex: "totalWeight", render: formatWeight },
                      { title: "运费", dataIndex: "shippingFee", render: formatMoney },
                      { title: "包装", dataIndex: "packageFee", render: formatMoney },
                      { title: "其它", dataIndex: "otherFee", render: formatMoney },
                      { title: "营销", dataIndex: "marketingFee", render: formatMoney },
                      { title: "运营", dataIndex: "operationFee", render: formatMoney },
                      { title: "总成本", dataIndex: "totalCost", render: formatMoney },
                      { title: "最终建议售价", dataIndex: "finalSuggestedPrice", render: formatMoney },
                      { title: "平台扣点", dataIndex: "platformFee", render: formatMoney },
                      { title: "预计利润", dataIndex: "estimatedProfit", render: formatMoney },
                      { title: "毛利率", dataIndex: "profitRate", render: formatPercent },
                      { title: "保本ROI", dataIndex: "breakEvenRoi" },
                      {
                        title: "复制",
                        render: (_, row) => (
                          <Tooltip title="复制当前行">
                            <Button
                              size="small"
                              onClick={async () => {
                                await navigator.clipboard.writeText(
                                  resultsToClipboardText([row])
                                );
                                message.success(`已复制 ${row.specName}`);
                              }}
                            >
                              复制
                            </Button>
                          </Tooltip>
                        )
                      }
                    ]}
                  />
                </Card>
              </Space>
            </Col>

            <Col xs={24} xxl={6}>
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card size="small" title="当前参数">
                  <Space direction="vertical" size={6}>
                    <Typography.Text>
                      平台扣点：{formatPercent(activeSettings.platformFeePercent)}
                    </Typography.Text>
                    <Typography.Text>
                      包装成本：
                      {activeSettings.packageFeeMode === "fixed"
                        ? `固定 ${formatMoney(activeSettings.packageFeeValue)}`
                        : `比例 ${formatPercent(activeSettings.packageFeeValue)}`}
                    </Typography.Text>
                    <Typography.Text>
                      其它成本：
                      {activeSettings.otherFeeMode === "fixed"
                        ? `固定 ${formatMoney(activeSettings.otherFeeValue)}`
                        : `比例 ${formatPercent(activeSettings.otherFeeValue)}`}
                    </Typography.Text>
                    <Typography.Text>
                      营销费用：
                      {activeSettings.marketingFeeMode === "fixed"
                        ? `固定 ${formatMoney(activeSettings.marketingFeeValue)}`
                        : `比例 ${formatPercent(activeSettings.marketingFeeValue)}`}
                    </Typography.Text>
                    <Typography.Text>
                      运营费用：{formatMoney(activeSettings.operationFee)}
                    </Typography.Text>
                    <Typography.Text>
                      目标毛利率：{formatPercent(activeSettings.targetProfitPercent)}
                    </Typography.Text>
                  </Space>
                </Card>
                <RecentProducts
                  products={recentProducts}
                  specs={specs}
                  onLoad={handleLoadProduct}
                  onDelete={(id) =>
                    void removeProduct(id)
                      .then(() => message.success("商品已删除"))
                      .catch((error) => message.error(getErrorMessage(error)))
                  }
                />
              </Space>
            </Col>
          </Row>
        </Card>
      </Space>

      <SettingsDrawer
        open={settingsOpen}
        settings={activeSettings}
        specs={specs}
        shippingRules={shippingRules}
        onClose={() => setSettingsOpen(false)}
        onSaveSettings={(value) =>
          void saveSettings(value)
            .then(() => message.success("设置已保存"))
            .catch((error) => message.error(getErrorMessage(error)))
        }
        onSaveSpec={(value) =>
          void saveSpec(value)
            .then(() => message.success("规格已保存"))
            .catch((error) => message.error(getErrorMessage(error)))
        }
        onDeleteSpec={(id) =>
          void removeSpec(id)
            .then(() => message.success("规格已删除"))
            .catch((error) => message.error(getErrorMessage(error)))
        }
        onSaveRule={(value) =>
          void saveRule(value)
            .then(() => message.success("运费规则已保存"))
            .catch((error) => message.error(getErrorMessage(error)))
        }
        onDeleteRule={(id) =>
          void removeRule(id)
            .then(() => message.success("运费规则已删除"))
            .catch((error) => message.error(getErrorMessage(error)))
        }
        onExportBackup={handleExportBackup}
        onImportBackup={(file) => {
          void handleImportBackup(file);
        }}
        onClearProducts={() =>
          void clearProducts()
            .then(() => message.success("本地商品已清空"))
            .catch((error) => message.error(getErrorMessage(error)))
        }
        onClearHistories={() =>
          void clearHistories()
            .then(() => message.success("本地历史已清空"))
            .catch((error) => message.error(getErrorMessage(error)))
        }
        onResetDefaults={() =>
          void resetDefaults()
            .then(() => message.success("默认数据已重置"))
            .catch((error) => message.error(getErrorMessage(error)))
        }
      />

      <HistoryDrawer
        open={historyOpen}
        histories={histories}
        selectedHistoryId={selectedHistoryId ?? selectedHistory?.id ?? null}
        onClose={() => setHistoryOpen(false)}
        onSearch={(keyword) =>
          void filterHistories(keyword).catch((error) => message.error(getErrorMessage(error)))
        }
        onSelect={(id) => setSelectedHistoryId(id)}
        onLoad={handleLoadHistory}
        onDelete={(id) =>
          void removeHistory(id)
            .then(() => message.success("历史记录已删除"))
            .catch((error) => message.error(getErrorMessage(error)))
        }
      />
    </>
  );
}
