import { AppApiError } from './AppApiError';
import type {
  Invoice,
  InvoiceStatus,
  CreateInvoicePayload,
  ResubmitPayload,
  ListInvoicesResponse,
} from '../types/invoice';

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  actorId?: string;
  approverId?: string;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.actorId) headers['X-Actor-Id'] = opts.actorId;
  if (opts.approverId) headers['X-Approver-Id'] = opts.approverId;

  const res = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'omit',
  });

  if (!res.ok) {
    let serverMessage = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json && typeof json.error === 'string') serverMessage = json.error;
    } catch {
      /* not JSON */
    }
    throw new AppApiError(res.status, serverMessage);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiClient = {
  listInvoices(params?: {
    status?: InvoiceStatus;
    limit?: number;
    offset?: number;
  }): Promise<ListInvoicesResponse> {
    return request<ListInvoicesResponse>('/api/invoices', { query: params });
  },

  getInvoice(id: string): Promise<Invoice> {
    return request<Invoice>(`/api/invoices/${encodeURIComponent(id)}`);
  },

  createInvoice(payload: CreateInvoicePayload, actorId: string): Promise<Invoice> {
    return request<Invoice>('/api/invoices', {
      method: 'POST',
      body: payload,
      actorId,
    });
  },

  approveInvoice(id: string, approverId: string): Promise<Invoice> {
    return request<Invoice>(`/api/invoices/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: {},
      approverId,
    });
  },

  rejectInvoice(
    id: string,
    payload: { rejection_reason: string },
    actorId: string,
  ): Promise<Invoice> {
    return request<Invoice>(`/api/invoices/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: payload,
      actorId,
    });
  },

  resubmitInvoice(id: string, payload: ResubmitPayload, actorId: string): Promise<Invoice> {
    return request<Invoice>(`/api/invoices/${encodeURIComponent(id)}/resubmit`, {
      method: 'PATCH',
      body: payload,
      actorId,
    });
  },

  deleteInvoice(id: string, actorId: string): Promise<void> {
    return request<void>(`/api/invoices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      actorId,
    });
  },
};
