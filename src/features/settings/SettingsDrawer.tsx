import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Row,
  Space,
  Switch,
  Table,
  Tabs,
  Typography,
  Upload
} from "antd";
import type { AppSettings, SalesSpec, ShippingRule } from "../../types";
import { createId } from "../../utils/id";

type Props = {
  open: boolean;
  settings: AppSettings;
  specs: SalesSpec[];
  shippingRules: ShippingRule[];
  onClose: () => void;
  onSaveSettings: (value: AppSettings) => void;
  onSaveSpec: (value: SalesSpec) => void;
  onDeleteSpec: (id: string) => void;
  onSaveRule: (value: ShippingRule) => void;
  onDeleteRule: (id: string) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onClearProducts: () => void;
  onClearHistories: () => void;
  onResetDefaults: () => void;
};

export function SettingsDrawer({
  open,
  settings,
  specs,
  shippingRules,
  onClose,
  onSaveSettings,
  onSaveSpec,
  onDeleteSpec,
  onSaveRule,
  onDeleteRule,
  onExportBackup,
  onImportBackup,
  onClearProducts,
  onClearHistories,
  onResetDefaults
}: Props) {
  const [settingsForm] = Form.useForm<AppSettings>();
  const [specForm] = Form.useForm<SalesSpec>();
  const [ruleForm] = Form.useForm<ShippingRule>();

  return (
    <Drawer
      title="设置"
      width={1080}
      placement="right"
      open={open}
      onClose={onClose}
      destroyOnHidden={false}
    >
      <Tabs
        defaultActiveKey="fees"
        items={[
          {
            key: "fees",
            label: "费用参数",
            children: (
              <Card title="当前费用参数">
                <Form
                  layout="vertical"
                  form={settingsForm}
                  initialValues={settings}
                  onFinish={(values) =>
                    onSaveSettings({
                      ...settings,
                      ...values,
                      updatedAt: new Date().toISOString()
                    })
                  }
                >
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      <Form.Item label="平台扣点 (%)" name="platformFeePercent">
                        <InputNumber min={0} max={100} precision={2} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="目标毛利率 (%)" name="targetProfitPercent">
                        <InputNumber min={0} max={100} precision={2} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="包装成本模式" name="packageFeeMode">
                        <Radio.Group
                          options={[
                            { label: "固定值", value: "fixed" },
                            { label: "百分比", value: "percent" }
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="包装成本值" name="packageFeeValue">
                        <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="其它成本模式" name="otherFeeMode">
                        <Radio.Group
                          options={[
                            { label: "固定值", value: "fixed" },
                            { label: "百分比", value: "percent" }
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="其它成本值" name="otherFeeValue">
                        <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="营销费用模式" name="marketingFeeMode">
                        <Radio.Group
                          options={[
                            { label: "固定值", value: "fixed" },
                            { label: "百分比", value: "percent" }
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="营销费用值" name="marketingFeeValue">
                        <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="运营费用" name="operationFee">
                        <InputNumber min={0} precision={2} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Button type="primary" htmlType="submit">
                    保存设置
                  </Button>
                </Form>
              </Card>
            )
          },
          {
            key: "shipping",
            label: "规格与运费",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Card title="销售规格">
                  <Form
                    form={specForm}
                    layout="inline"
                    initialValues={{
                      id: createId(),
                      name: "",
                      quantity: 1,
                      sortNo: specs.length * 10 + 10,
                      enabled: true,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    }}
                    onFinish={(values) =>
                      onSaveSpec({
                        ...values,
                        id: values.id || createId(),
                        createdAt: values.createdAt || new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                      })
                    }
                  >
                    <Form.Item name="name" rules={[{ required: true, message: "请输入规格名称" }]}>
                      <Input placeholder="规格名称，例如 X8" />
                    </Form.Item>
                    <Form.Item
                      name="quantity"
                      rules={[{ required: true, message: "请输入数量" }]}
                    >
                      <InputNumber min={1} placeholder="数量" />
                    </Form.Item>
                    <Form.Item name="sortNo">
                      <InputNumber min={0} placeholder="排序" />
                    </Form.Item>
                    <Form.Item name="enabled" valuePropName="checked">
                      <Switch checkedChildren="启用" unCheckedChildren="停用" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit">
                      保存规格
                    </Button>
                  </Form>
                  <Table
                    style={{ marginTop: 16 }}
                    rowKey="id"
                    pagination={false}
                    dataSource={specs}
                    columns={[
                      { title: "名称", dataIndex: "name" },
                      { title: "数量", dataIndex: "quantity" },
                      { title: "排序", dataIndex: "sortNo" },
                      {
                        title: "状态",
                        dataIndex: "enabled",
                        render: (value: boolean) => (value ? "启用" : "停用")
                      },
                      {
                        title: "操作",
                        render: (_, row) => (
                          <Space>
                            <Button onClick={() => specForm.setFieldsValue(row)}>编辑</Button>
                            <Popconfirm
                              title="确认删除该规格？"
                              onConfirm={() => onDeleteSpec(row.id)}
                              okText="删除"
                              cancelText="取消"
                            >
                              <Button danger>删除</Button>
                            </Popconfirm>
                          </Space>
                        )
                      }
                    ]}
                  />
                </Card>
                <Card title="重量区间运费">
                  <Form
                    form={ruleForm}
                    layout="inline"
                    initialValues={{
                      id: createId(),
                      weightMin: 0,
                      weightMax: 500,
                      shippingFee: 0,
                      sortNo: shippingRules.length * 10 + 10,
                      enabled: true,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    }}
                    onFinish={(values) =>
                      onSaveRule({
                        ...values,
                        id: values.id || createId(),
                        createdAt: values.createdAt || new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                      })
                    }
                  >
                    <Form.Item name="weightMin" rules={[{ required: true }]}>
                      <InputNumber min={0} placeholder="最小重量(g)" />
                    </Form.Item>
                    <Form.Item name="weightMax" rules={[{ required: true }]}>
                      <InputNumber min={0} placeholder="最大重量(g)" />
                    </Form.Item>
                    <Form.Item name="shippingFee" rules={[{ required: true }]}>
                      <InputNumber min={0} precision={2} placeholder="运费" />
                    </Form.Item>
                    <Form.Item name="sortNo">
                      <InputNumber min={0} placeholder="排序" />
                    </Form.Item>
                    <Form.Item name="enabled" valuePropName="checked">
                      <Switch checkedChildren="启用" unCheckedChildren="停用" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit">
                      保存区间
                    </Button>
                  </Form>
                  <Table
                    style={{ marginTop: 16 }}
                    rowKey="id"
                    pagination={false}
                    dataSource={shippingRules}
                    columns={[
                      {
                        title: "重量区间",
                        render: (_, row) => `${row.weightMin}g - ${row.weightMax}g`
                      },
                      { title: "运费", dataIndex: "shippingFee" },
                      { title: "排序", dataIndex: "sortNo" },
                      {
                        title: "状态",
                        dataIndex: "enabled",
                        render: (value: boolean) => (value ? "启用" : "停用")
                      },
                      {
                        title: "操作",
                        render: (_, row) => (
                          <Space>
                            <Button onClick={() => ruleForm.setFieldsValue(row)}>编辑</Button>
                            <Popconfirm
                              title="确认删除该运费规则？"
                              onConfirm={() => onDeleteRule(row.id)}
                              okText="删除"
                              cancelText="取消"
                            >
                              <Button danger>删除</Button>
                            </Popconfirm>
                          </Space>
                        )
                      }
                    ]}
                  />
                </Card>
              </Space>
            )
          },
          {
            key: "data",
            label: "本地数据管理",
            children: (
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Alert
                  type="warning"
                  showIcon
                  message="Web 版数据仅保存在当前浏览器"
                  description="更换设备、清理浏览器缓存或使用无痕模式都可能导致数据丢失。建议定期导出 JSON 备份。"
                />
                <Card title="导入导出">
                  <Space wrap>
                    <Button type="primary" onClick={onExportBackup}>
                      导出全部本地数据
                    </Button>
                    <Upload
                      accept=".json,application/json"
                      beforeUpload={(file) => {
                        onImportBackup(file);
                        return false;
                      }}
                      showUploadList={false}
                    >
                      <Button>导入 JSON 覆盖本地数据</Button>
                    </Upload>
                  </Space>
                </Card>
                <Card title="清理与重置">
                  <Space direction="vertical" size={12}>
                    <Space wrap>
                      <Popconfirm
                        title="确认清空本地商品？"
                        onConfirm={onClearProducts}
                        okText="清空"
                        cancelText="取消"
                      >
                        <Button danger>清空本地商品</Button>
                      </Popconfirm>
                      <Popconfirm
                        title="确认清空本地历史？"
                        onConfirm={onClearHistories}
                        okText="清空"
                        cancelText="取消"
                      >
                        <Button danger>清空本地历史</Button>
                      </Popconfirm>
                      <Popconfirm
                        title="确认重置默认规格、默认运费和默认设置？"
                        onConfirm={onResetDefaults}
                        okText="重置"
                        cancelText="取消"
                      >
                        <Button>重置默认数据</Button>
                      </Popconfirm>
                    </Space>
                    <Typography.Text type="secondary">
                      导入会覆盖当前浏览器中的全部业务数据，请先导出备份。
                    </Typography.Text>
                  </Space>
                </Card>
              </Space>
            )
          }
        ]}
      />
    </Drawer>
  );
}
