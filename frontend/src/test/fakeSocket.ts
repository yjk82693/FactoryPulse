export class FakeSocket {
  static instances: FakeSocket[] = [];
  url: string;
  sent: string[] = [];
  private listeners: Record<string, Array<(event: { data?: string; code?: number }) => void>> = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  constructor(url: string | URL) {
    this.url = String(url);
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (event: { data?: string; code?: number }) => void): void {
    this.listeners[type]?.push(fn);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000): void {
    for (const fn of this.listeners.close ?? []) {
      fn({ code });
    }
  }

  open(): void {
    for (const fn of this.listeners.open ?? []) {
      fn({});
    }
  }

  push(data: string): void {
    for (const fn of this.listeners.message ?? []) {
      fn({ data });
    }
  }
}
