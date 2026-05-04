import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { InvoiceDetailPage } from '../../src/pages/InvoiceDetailPage';
import { apiClient } from '../../src/api/apiClient';
import { AppApiError } from '../../src/api/AppApiError';
import { setActorId, setApproverId } from '../../src/lib/actor';
import type { Invoice, InvoiceStatus } from '../../src/types/invoice';
import { toastStore } from '../../src/components/Toast';

const navigateMock = vi.fn();
const useParamsMock = vi.fn(() => ({ id: 'inv-1' }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => useParamsMock(),
  };
});

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
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
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InvoiceDetailPage />
    </MemoryRouter>,
  );
}

function getCurrentToasts(): { variant: string; message: string }[] {
  const captured: { variant: string; message: string }[] = [];
  const unsub = toastStore.subscribe((items) => {
    captured.length = 0;
    for (const i of items) captured.push({ variant: i.variant, message: i.message });
  });
  unsub();
  return captured;
}

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useParamsMock.mockReturnValue({ id: 'inv-1' });
    setActorId('user-001');
    setApproverId('approver-001');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('D-01: fetches invoice by id and shows fields', async () => {
    const getSpy = vi
      .spyOn(apiClient, 'getInvoice')
      .mockResolvedValue(makeInvoice());
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeInTheDocument();
    });
    expect(getSpy).toHaveBeenCalledWith('inv-1');
  });

  it('D-02: pending shows 承認/差戻し/削除 but no resubmit', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue(makeInvoice({ status: 'pending' }));
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    expect(screen.getByRole('button', { name: '承認' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '差戻し' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '編集して再提出' })).not.toBeInTheDocument();
  });

  it('D-03: mismatch shows only 差戻し and 削除', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue(
      makeInvoice({ status: 'mismatch', purchase_order_amount: 90000 }),
    );
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    expect(screen.queryByRole('button', { name: '承認' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '差戻し' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
  });

  it('D-04: rejected shows 編集して再提出 and 削除', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue(
      makeInvoice({
        status: 'rejected',
        rejection_reason: 'wrong amount',
        rejected_by: 'user-002',
        rejected_at: '2026-05-04T11:00:00.000Z',
      }),
    );
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    expect(screen.getByRole('button', { name: '編集して再提出' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '承認' })).not.toBeInTheDocument();
  });

  it('D-05: approved shows no action buttons + caption', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue(
      makeInvoice({
        status: 'approved',
        approver_id: 'approver-001',
        approved_at: '2026-05-04T12:00:00.000Z',
      }),
    );
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    expect(screen.queryByRole('button', { name: '承認' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '差戻し' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
    expect(screen.getByText('承認済の請求書は変更できません')).toBeInTheDocument();
  });

  it('D-06: approve click triggers approve API and refetch', async () => {
    const getSpy = vi
      .spyOn(apiClient, 'getInvoice')
      .mockResolvedValueOnce(makeInvoice({ status: 'pending' }))
      .mockResolvedValueOnce(
        makeInvoice({
          status: 'approved',
          approver_id: 'approver-001',
          approved_at: '2026-05-04T12:00:00.000Z',
        }),
      );
    const approveSpy = vi
      .spyOn(apiClient, 'approveInvoice')
      .mockResolvedValue(makeInvoice({ status: 'approved' }));
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    await userEvent.click(screen.getByRole('button', { name: '承認' }));
    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledWith('inv-1', 'approver-001');
      expect(getSpy).toHaveBeenCalledTimes(2);
    });
    const toasts = getCurrentToasts();
    expect(toasts.some((t) => t.variant === 'success' && t.message.includes('承認しました'))).toBe(
      true,
    );
  });

  it('D-07: approve 422 shows fixed mismatch message', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue(makeInvoice({ status: 'pending' }));
    vi.spyOn(apiClient, 'approveInvoice').mockRejectedValue(
      new AppApiError(422, 'mismatch invoice'),
    );
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    await userEvent.click(screen.getByRole('button', { name: '承認' }));
    await waitFor(() => {
      const toasts = getCurrentToasts();
      expect(
        toasts.some((t) => t.message === 'mismatch のため承認できません'),
      ).toBe(true);
    });
  });

  it('D-08: reject dialog opens with submit disabled when reason is empty', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue(makeInvoice({ status: 'pending' }));
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    await userEvent.click(screen.getByRole('button', { name: '差戻し' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: '差戻す' });
    expect(confirmBtn).toBeDisabled();
  });

  it('D-09: reject submit calls API and shows toast', async () => {
    const getSpy = vi
      .spyOn(apiClient, 'getInvoice')
      .mockResolvedValue(makeInvoice({ status: 'pending' }));
    const rejectSpy = vi
      .spyOn(apiClient, 'rejectInvoice')
      .mockResolvedValue(
        makeInvoice({
          status: 'rejected',
          rejection_reason: 'NG',
          rejected_by: 'user-001',
          rejected_at: '2026-05-04T13:00:00.000Z',
        }),
      );
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    await userEvent.click(screen.getByRole('button', { name: '差戻し' }));
    const textarea = screen.getByLabelText(/差戻し理由/) as HTMLTextAreaElement;
    await userEvent.type(textarea, 'NG');
    await userEvent.click(screen.getByRole('button', { name: '差戻す' }));
    await waitFor(() => {
      expect(rejectSpy).toHaveBeenCalledWith('inv-1', { rejection_reason: 'NG' }, 'user-001');
      expect(getSpy).toHaveBeenCalled();
    });
  });

  it('D-10: resubmit with no changes shows error', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue(
      makeInvoice({ status: 'rejected' as InvoiceStatus }),
    );
    const resubmitSpy = vi.spyOn(apiClient, 'resubmitInvoice');
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    await userEvent.click(screen.getByRole('button', { name: '編集して再提出' }));
    await userEvent.click(screen.getByRole('button', { name: '再提出する' }));
    await waitFor(() => {
      expect(
        screen.getByText('少なくとも1つのフィールドを変更してください'),
      ).toBeInTheDocument();
    });
    expect(resubmitSpy).not.toHaveBeenCalled();
  });

  it('D-11: resubmit with amount change sends only invoice_amount', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue(
      makeInvoice({ status: 'rejected' as InvoiceStatus }),
    );
    const resubmitSpy = vi
      .spyOn(apiClient, 'resubmitInvoice')
      .mockResolvedValue(makeInvoice({ status: 'pending' }));
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    await userEvent.click(screen.getByRole('button', { name: '編集して再提出' }));
    const amountInput = document.getElementById('resubmit-invoice-amount') as HTMLInputElement;
    await userEvent.clear(amountInput);
    await userEvent.type(amountInput, '95000');
    await userEvent.click(screen.getByRole('button', { name: '再提出する' }));
    await waitFor(() => {
      expect(resubmitSpy).toHaveBeenCalledWith('inv-1', { invoice_amount: 95000 }, 'user-001');
    });
  });

  it('D-12: delete dialog OK disabled until correct text', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue(makeInvoice({ status: 'pending' }));
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    await userEvent.click(screen.getByRole('button', { name: '削除' }));
    const confirmBtn = screen.getAllByRole('button', { name: '削除' })[1];
    expect(confirmBtn).toBeDisabled();
    const input = document.getElementById('confirm-dialog-input') as HTMLInputElement;
    await userEvent.type(input, '削除');
    expect(confirmBtn).not.toBeDisabled();
  });

  it('D-13: delete success calls API and navigates to /', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue(makeInvoice({ status: 'pending' }));
    const deleteSpy = vi.spyOn(apiClient, 'deleteInvoice').mockResolvedValue();
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    await userEvent.click(screen.getByRole('button', { name: '削除' }));
    const input = document.getElementById('confirm-dialog-input') as HTMLInputElement;
    await userEvent.type(input, '削除');
    const confirmBtn = screen.getAllByRole('button', { name: '削除' })[1];
    await userEvent.click(confirmBtn);
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('inv-1', 'user-001');
      expect(navigateMock).toHaveBeenCalledWith('/');
    });
  });

  it('D-14: delete 409 shows fixed message', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockResolvedValue(makeInvoice({ status: 'pending' }));
    vi.spyOn(apiClient, 'deleteInvoice').mockRejectedValue(new AppApiError(409, 'cannot delete'));
    renderPage();
    await waitFor(() => screen.getByText('INV-001'));
    await userEvent.click(screen.getByRole('button', { name: '削除' }));
    const input = document.getElementById('confirm-dialog-input') as HTMLInputElement;
    await userEvent.type(input, '削除');
    const confirmBtn = screen.getAllByRole('button', { name: '削除' })[1];
    await userEvent.click(confirmBtn);
    await waitFor(() => {
      const toasts = getCurrentToasts();
      expect(
        toasts.some((t) => t.message === '承認済の請求書は削除できません'),
      ).toBe(true);
    });
  });

  it('D-15: 404 shows in-page alert with back link', async () => {
    vi.spyOn(apiClient, 'getInvoice').mockRejectedValue(new AppApiError(404, 'not found'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('請求書が見つかりません')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '一覧へ戻る' })).toBeInTheDocument();
    // Toast should NOT be shown
    const toasts = getCurrentToasts();
    expect(toasts.length).toBe(0);
  });
});
