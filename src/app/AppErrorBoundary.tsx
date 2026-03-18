import { Alert, Card } from "antd";
import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage: string | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: null
  };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : "页面运行时发生未知异常"
    };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <Card title="SKU 计算器 Web 版">
          <Alert
            type="error"
            showIcon
            message="页面运行异常"
            description={this.state.errorMessage ?? "请刷新页面后重试当前操作。"}
          />
        </Card>
      );
    }

    return this.props.children;
  }
}
