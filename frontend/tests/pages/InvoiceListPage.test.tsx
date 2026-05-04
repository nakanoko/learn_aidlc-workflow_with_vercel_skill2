import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { InvoiceListPage } from '../../src/pages/InvoiceListPage';
import { apiClient } from '../../src/api/apiClient';
import { AppApiError } from '../../src/api/AppApiError';
import type { Invoice } from '../../src/types/invoice';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const sample: Invoice = {
  id: 'inv-1',
  invoice_number: 'INV-001',
  vendor_id: 'VENDOR-A',
  invoice_amount: 100000,
  purchase_order_amount: 100000,
  due_date: '2026-06-30',
  status: 'pending',
  approver_id: null,
  approved_at: null,
  rejection_reason: null,
  rejected_by: null,
  rejected_at: null,
  created_at: '2026-05-04T10:00:00.000Z',
  updated_at: '2026-05-04T10:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <InvoiceListPage />
    </MemoryRouter>,
  );
}

describe('InvoiceListPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('L-01: calls listInvoices on mount with no status', async () => {
    const spy = vi.spyOn(apiClient, 'listInvoices').mockResolvedValue({ items: [], total: 0 });
    renderPage();
    await waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
    expect(spy).toHaveBeenCalledWith(undefined);
  });

  it('L-02: displays fetched invoices', async () => {
    vi.spyOn(apiClient, 'listInvoices').mockResolvedValue({ items: [sample], total: 1 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    });
    expect(screen.getByText('VENDOR-A')).toBeInTheDocument();
  });

  it('L-03: changing select refetches with status', async () => {
    const spy = vi.spyOn(apiClient, 'listInvoices').mockResolvedValue({ items: [], total: 0 });
    renderPage();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const select = screen.getByLabelText('ステータス');
    await userEvent.selectOptions(select, 'approved');
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({ status: 'approved' });
    });
  });

  it('L-04: row click navigates to detail', async () => {
    vi.spyOn(apiClient, 'listInvoices').mockResolvedValue({ items: [sample], total: 1 });
    renderPage();
    await waitFor(() => expect(screen.getByText('INV-001')).toBeInTheDocument());
    const row = screen.getByRole('button', { name: /INV-001/ });
    await userEvent.click(row);
    expect(navigateMock).toHaveBeenCalledWith('/invoices/inv-1');
  });

  it('L-05: new button navigates to /invoices/new', async () => {
    vi.spyOn(apiClient, 'listInvoices').mockResolvedValue({ items: [sample], total: 1 });
    renderPage();
    await waitFor(() => expect(screen.getByText('INV-001')).toBeInTheDocument());
    const buttons = screen.getAllByRole('button', { name: /新規登録/ });
    await userEvent.click(buttons[0]);
    expect(navigateMock).toHaveBeenCalledWith('/invoices/new');
  });

  it('L-06: shows loading text', async () => {
    let resolver: (v: { items: Invoice[]; total: number }) => void = () => {};
    vi.spyOn(apiClient, 'listInvoices').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    renderPage();
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    resolver({ items: [], total: 0 });
  });

  it('L-07: shows error alert with retry', async () => {
    const spy = vi
      .spyOn(apiClient, 'listInvoices')
      .mockRejectedValueOnce(new AppApiError(500, 'Server'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText('Server')).toBeInTheDocument();
    spy.mockResolvedValue({ items: [sample], total: 1 });
    const retry = screen.getByRole('button', { name: '再試行' });
    await userEvent.click(retry);
    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    });
  });

  it('L-08: shows empty state when no items', async () => {
    vi.spyOn(apiClient, 'listInvoices').mockResolvedValue({ items: [], total: 0 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('該当する請求書がありません。')).toBeInTheDocument();
    });
  });
});
