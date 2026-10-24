import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  message: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.setState({ message: error.message });
  }

  render(): ReactNode {
    if (this.state.message) {
      return (
        <div className="config-error">
          <h1>Dashboard error</h1>
          <p>{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
