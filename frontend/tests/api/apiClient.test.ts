import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../src/api/apiClient';
import { AppApiError } from '../../src/api/AppApiError';

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  body?: unknown;
  bodyIsText?: boolean;
}) {
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const ok = response.ok ?? true;
    const status = response.status ?? 200;
    return {
      ok,
      status,
      async json() {
        if (response.bodyIsText) throw new Error('not json');
        return response.body;
      },
    } as unknown as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('apiClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('API-01: listInvoices builds GET URL with status query', async () => {
    const fetchSpy = mockFetch({ ok: true, status: 200, body: { items: [], total: 0 } });
    await apiClient.listInvoices({ status: 'pending' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0]!;
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toContain('/api/invoices');
    expect(url).toContain('status=pending');
    expect(init.method).toBe('GET');
  });

  it('API-02: createInvoice sends POST with Content-Type and X-Actor-Id', async () => {
    const fetchSpy = mockFetch({
      ok: true,
      status: 201,
      body: { id: 'inv-1', invoice_number: 'X' },
    });
    await apiClient.createInvoice(
      {
        invoice_number: 'INV-1',
        vendor_id: 'V',
        invoice_amount: 100,
        purchase_order_amount: 100,
        due_date: '2026-06-30',
      },
      'user-001',
    );
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Actor-Id']).toBe('user-001');
    expect(headers['X-Approver-Id']).toBeUndefined();
  });

  it('API-03: approveInvoice sends X-Approver-Id, no X-Actor-Id', async () => {
    const fetchSpy = mockFetch({ ok: true, status: 200, body: { id: 'inv-1' } });
    await apiClient.approveInvoice('inv-1', 'approver-1');
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Approver-Id']).toBe('approver-1');
    expect(headers['X-Actor-Id']).toBeUndefined();
    expect(init.method).toBe('POST');
  });

  it('API-04: 4xx with JSON body throws AppApiError carrying server error message', async () => {
    mockFetch({ ok: false, status: 409, body: { error: '重複しています' } });
    await expect(
      apiClient.createInvoice(
        {
          invoice_number: 'X',
          vendor_id: 'V',
          invoice_amount: 0,
          purchase_order_amount: 0,
          due_date: '2026-06-30',
        },
        'a',
      ),
    ).rejects.toThrowError(AppApiError);
    try {
      await apiClient.createInvoice(
        {
          invoice_number: 'X',
          vendor_id: 'V',
          invoice_amount: 0,
          purchase_order_amount: 0,
          due_date: '2026-06-30',
        },
        'a',
      );
    } catch (e) {
      expect(e).toBeInstanceOf(AppApiError);
      const err = e as AppApiError;
      expect(err.httpStatus).toBe(409);
      expect(err.serverMessage).toBe('重複しています');
    }
  });

  it('API-05: 4xx with non-JSON body falls back to HTTP {status}', async () => {
    mockFetch({ ok: false, status: 500, bodyIsText: true });
    try {
      await apiClient.getInvoice('x');
      throw new Error('expected throw');
    } catch (e) {
      const err = e as AppApiError;
      expect(err).toBeInstanceOf(AppApiError);
      expect(err.serverMessage).toBe('HTTP 500');
    }
  });

  it('API-06: 204 returns undefined and json is not called', async () => {
    const jsonSpy = vi.fn();
    globalThis.fetch = vi.fn(async () => {
      return {
        ok: true,
        status: 204,
        json: jsonSpy,
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const result = await apiClient.deleteInvoice('inv-1', 'user-001');
    expect(result).toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('API-07/08: VITE_API_BASE_URL default is http://localhost:3000', async () => {
    const fetchSpy = mockFetch({ ok: true, status: 200, body: { items: [], total: 0 } });
    await apiClient.listInvoices();
    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url.startsWith('http://localhost:3000')).toBe(true);
  });
});
