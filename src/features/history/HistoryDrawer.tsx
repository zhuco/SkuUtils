import {
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  Popconfirm,
  Space,
  Tag,
  Typography
} from "antd";
import type { CalculationHistory } from "../../types";
import { formatDateTime } from "../../utils/format";

type Props = {
  open: boolean;
  histories: CalculationHistory[];
  selectedHistoryId: string | null;
  onClose: () => void;
  onSearch: (keyword: string) => void;
  onSelect: (id: string) => void;
  onLoad: (history: CalculationHistory) => void;
  onDelete: (id: string) => void;
};

export function HistoryDrawer({
  open,
  histories,
  onClose,
  onSearch,
  onLoad,
  onDelete
}: Props) {
  function renderQuantitySummary(quantities: number[], unitLabel: CalculationHistory["unitLabel"]) {
    const visible = quantities.slice(0, 4);
    const hiddenCount = Math.max(quantities.length - visible.length, 0);

    return (
      <Space size={[4, 4]} wrap>
        {visible.map((quantity) => (
          <Tag key={quantity}>{`X${quantity}${unitLabel}`}</Tag>
        ))}
        {hiddenCount > 0 ? <Tag>+{hiddenCount}</Tag> : null}
      </Space>
    );
  }

  return (
    <Drawer
      title="历史记录"
      placement="right"
      width={980}
      open={open}
      onClose={onClose}
      destroyOnHidden={false}
    >
      <Card
        title="最近 100 条历史"
        extra={
          <Input.Search
            placeholder="按商品名称搜索"
            allowClear
            onSearch={onSearch}
            onChange={(event) => {
              if (!event.target.value) {
                onSearch("");
              }
            }}
          />
        }
      >
        {histories.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史记录" />
        ) : (
          <div className="history-grid">
            {histories.map((history) => (
              <div key={history.id} className="history-tile">
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  <Space style={{ justifyContent: "space-between", width: "100%" }}>
                    <Typography.Text strong ellipsis style={{ maxWidth: 220 }}>
                      {history.productName}
                    </Typography.Text>
                    <Typography.Text type="secondary" className="history-time">
                      {formatDateTime(history.createdAt)}
                    </Typography.Text>
                  </Space>
                  <Space size={10} wrap>
                    <Tag color="green">{history.items.length} 个规格</Tag>
                    {renderQuantitySummary(history.selectedQuantities, history.unitLabel)}
                  </Space>
                  <Space size={8}>
                    <Button type="primary" size="small" onClick={() => onLoad(history)}>
                      回填
                    </Button>
                    <Popconfirm
                      title="确认删除这条历史记录？"
                      onConfirm={() => onDelete(history.id)}
                      okText="删除"
                      cancelText="取消"
                    >
                      <Button danger size="small">
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                </Space>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Drawer>
  );
}
