export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export type ToastItem = {
  id: string;
  variant: ToastVariant;
  message: string;
};

type ToastListener = (items: ToastItem[]) => void;

class ToastStore {
  private items: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();
  private counter = 0;

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener([...this.items]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  push(variant: ToastVariant, message: string): string {
    const id = `t-${++this.counter}-${Date.now()}`;
    this.items = [...this.items, { id, variant, message }];
    this.emit();
    return id;
  }

  remove(id: string): void {
    this.items = this.items.filter((t) => t.id !== id);
    this.emit();
  }

  clear(): void {
    this.items = [];
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener([...this.items]);
    }
  }
}

export const toastStore = new ToastStore();

export const toast = {
  success: (message: string): string => toastStore.push('success', message),
  error: (message: string): string => toastStore.push('error', message),
  warning: (message: string): string => toastStore.push('warning', message),
  info: (message: string): string => toastStore.push('info', message),
};
