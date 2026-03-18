import { App as AntApp, ConfigProvider, Layout, Typography } from "antd";
import zhCN from "antd/locale/zh_CN";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { Workbench } from "../features/calculator/Workbench";

export function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#176a5b",
          borderRadius: 14,
          colorBgLayout: "#f4efe4",
          colorBgContainer: "#fffaf0",
          fontFamily:
            '"IBM Plex Sans","PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif'
        }
      }}
    >
      <AntApp>
        <Layout className="app-shell">
          <Layout.Header className="app-header">
            <div>
              <Typography.Title level={2} className="app-title">
                SKU计算器 Web 版
              </Typography.Title>
              <Typography.Paragraph className="app-subtitle">
                纯前端 SPA，数据默认保存在当前浏览器，无需登录，计算逻辑沿用桌面版口径。
              </Typography.Paragraph>
            </div>
          </Layout.Header>
          <Layout.Content className="app-content">
            <AppErrorBoundary>
              <Workbench />
            </AppErrorBoundary>
          </Layout.Content>
        </Layout>
      </AntApp>
    </ConfigProvider>
  );
}
