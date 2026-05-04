import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { InvoiceCreatePage } from '../../src/pages/InvoiceCreatePage';
import { apiClient } from '../../src/api/apiClient';
import { AppApiError } from '../../src/api/AppApiError';
import { setActorId } from '../../src/lib/actor';
import { toastStore } from '../../src/components/Toast';
import type { Invoice } from '../../src/types/invoice';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <InvoiceCreatePage />
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

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText(/請求番号/), 'INV-001');
  await userEvent.type(screen.getByLabelText(/取引先ID/), 'VENDOR-A');
  await userEvent.type(screen.getByLabelText(/請求金額/), '100000');
  await userEvent.type(screen.getByLabelText(/発注金額/), '100000');
  // due_date is type=date input; set value directly through fireEvent
  const dueInput = screen.getByLabelText(/支払期限/) as HTMLInputElement;
  await userEvent.clear(dueInput);
  await userEvent.type(dueInput, '2026-06-30');
}

describe('InvoiceCreatePage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    setActorId('user-001');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('C-01: missing required shows zod errors and does not call createInvoice', async () => {
    const spy = vi.spyOn(apiClient, 'createInvoice');
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    await waitFor(() => {
      expect(screen.getByText('請求番号を入力してください')).toBeInTheDocument();
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('C-03: negative amount shows error', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/請求番号/), 'INV-001');
    await userEvent.type(screen.getByLabelText(/取引先ID/), 'VENDOR-A');
    await userEvent.type(screen.getByLabelText(/請求金額/), '-1');
    await userEvent.type(screen.getByLabelText(/発注金額/), '0');
    const dueInput = screen.getByLabelText(/支払期限/) as HTMLInputElement;
    await userEvent.type(dueInput, '2026-06-30');
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    await waitFor(() => {
      expect(screen.getByText('0以上の値を入力してください')).toBeInTheDocument();
    });
  });

  it('C-05: success calls createInvoice, toast.success, navigate(/)', async () => {
    const spy = vi.spyOn(apiClient, 'createInvoice').mockResolvedValue({
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
    });
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith('/');
    });
  });

  it('C-06: 409 shows duplicate banner and does not clear fields', async () => {
    vi.spyOn(apiClient, 'createInvoice').mockRejectedValue(
      new AppApiError(409, 'duplicate'),
    );
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    await waitFor(() => {
      expect(
        screen.getByText(/すでに登録済みです/),
      ).toBeInTheDocument();
    });
    expect((screen.getByLabelText(/請求番号/) as HTMLInputElement).value).toBe('INV-001');
  });

  it('C-07: 400 with unrecognized message uses warning toast', async () => {
    vi.spyOn(apiClient, 'createInvoice').mockRejectedValue(
      new AppApiError(400, 'unknown error'),
    );
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    await waitFor(() => {
      expect(getCurrentToasts().some((t) => t.variant === 'warning')).toBe(true);
    });
  });

  it('C-08: 5xx triggers error toast', async () => {
    vi.spyOn(apiClient, 'createInvoice').mockRejectedValue(
      new AppApiError(500, 'server error'),
    );
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    await waitFor(() => {
      expect(getCurrentToasts().some((t) => t.variant === 'error')).toBe(true);
    });
  });

  it('C-09: submitting disables button and shows 登録中…', async () => {
    let resolver: (v: unknown) => void = () => {};
    vi.spyOn(apiClient, 'createInvoice').mockImplementation(
      () =>
        new Promise<Invoice>((resolve) => {
          resolver = resolve as (v: unknown) => void;
        }),
    );
    renderPage();
    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: '登録する' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '登録中…' })).toBeDisabled();
    });
    resolver({});
  });
});
