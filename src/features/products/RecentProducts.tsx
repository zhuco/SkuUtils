import { Button, Card, Empty, List, Popconfirm, Space, Tag, Typography } from "antd";
import type { Product, SalesSpec } from "../../types";
import { formatDateTime, formatMoney, formatWeight } from "../../utils/format";

type Props = {
  products: Product[];
  specs: SalesSpec[];
  onLoad: (product: Product) => void;
  onDelete: (id: string) => void;
};

export function RecentProducts({ products, specs, onLoad, onDelete }: Props) {
  const labelMap = new Map(specs.map((spec) => [spec.id, spec.name]));

  return (
    <Card title="最近商品" extra={<Typography.Text type="secondary">最近 20 条</Typography.Text>}>
      {products.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有保存商品" />
      ) : (
        <List
          itemLayout="vertical"
          dataSource={products}
          renderItem={(product) => (
            <List.Item
              actions={[
                <Button key="load" type="link" onClick={() => onLoad(product)}>
                  载入并计算
                </Button>,
                <Popconfirm
                  key="delete"
                  title="确认删除该商品？"
                  onConfirm={() => onDelete(product.id)}
                  okText="删除"
                  cancelText="取消"
                >
                  <Button danger type="link">
                    删除
                  </Button>
                </Popconfirm>
              ]}
            >
              <Space direction="vertical" size={4} style={{ width: "100%" }}>
                <Typography.Text strong>{product.name}</Typography.Text>
                <Typography.Text type="secondary">
                  成本 {formatMoney(product.unitCost)} / 重量 {formatWeight(product.unitWeight)}
                </Typography.Text>
                <div>
                  {product.selectedSpecIds.map((specId) => (
                    <Tag key={specId}>{labelMap.get(specId) ?? specId}</Tag>
                  ))}
                </div>
                <Typography.Text type="secondary">
                  更新于 {formatDateTime(product.updatedAt)}
                </Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
