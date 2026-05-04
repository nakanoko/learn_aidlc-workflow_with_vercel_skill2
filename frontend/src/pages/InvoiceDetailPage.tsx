import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../api/apiClient';
import { AppApiError } from '../api/AppApiError';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';
import { StatusBadge } from '../components/StatusBadge';
import { toast } from '../components/Toast';
import { getActorId, getApproverId } from '../lib/actor';
import { formatDate, formatDateTime, formatJpy } from '../lib/format';
import { handleServerError } from '../lib/handleServerError';
import type { Invoice, ResubmitPayload } from '../types/invoice';

type ResubmitFormValues = {
  invoice_amount: string;
  purchase_order_amount: string;
  due_date: string;
};

export function InvoiceDetailPage(): JSX.Element | null {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<boolean>(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectErr, setRejectErr] = useState<string | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitValues, setResubmitValues] = useState<ResubmitFormValues>({
    invoice_amount: '',
    purchase_order_amount: '',
    due_date: '',
  });
  const [resubmitErr, setResubmitErr] = useState<string | null>(null);
  const [resubmitLoading, setResubmitLoading] = useState(false);

  const fetchInvoice = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const inv = await apiClient.getInvoice(id);
      setInvoice(inv);
      setResubmitValues({
        invoice_amount: String(inv.invoice_amount),
        purchase_order_amount: String(inv.purchase_order_amount),
        due_date: inv.due_date,
      });
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.httpStatus === 404) {
          setNotFound(true);
        } else {
          setError(err.serverMessage);
        }
      } else {
        setError('ネットワークエラーが発生しました');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchInvoice();
  }, [fetchInvoice]);

  const handleApprove = async () => {
    if (!invoice || !id) return;
    const approverId = getApproverId();
    if (!approverId) {
      toast.error('承認者IDが設定されていません。ヘッダー右上から設定してください。');
      return;
    }
    try {
      await apiClient.approveInvoice(id, approverId);
      toast.success('承認しました');
      await fetchInvoice();
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.httpStatus === 400 && /Approver|承認者/i.test(err.serverMessage)) {
          toast.error('承認者IDが設定されていません。ヘッダー右上から設定してください。');
          return;
        }
        if (err.httpStatus === 404) {
          toast.error('対象の請求書が見つかりません');
          return;
        }
        if (err.httpStatus === 409) {
          toast.error(err.serverMessage);
          return;
        }
        if (err.httpStatus === 422) {
          toast.error('mismatch のため承認できません');
          return;
        }
      }
      handleServerError(err, 'approve');
    }
  };

  const openReject = () => {
    setRejectReason('');
    setRejectErr(null);
    setRejectOpen(true);
  };

  const handleReject = async () => {
    if (!id) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < 1) {
      setRejectErr('差戻し理由を入力してください');
      return;
    }
    if (trimmed.length > 500) {
      setRejectErr('500文字以内で入力してください');
      return;
    }
    const actorId = getActorId();
    if (!actorId) {
      toast.error('Actor IDが設定されていません。ヘッダー右上から設定してください。');
      return;
    }
    setRejectLoading(true);
    try {
      await apiClient.rejectInvoice(id, { rejection_reason: trimmed }, actorId);
      toast.success('差戻しました');
      setRejectOpen(false);
      await fetchInvoice();
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.httpStatus === 400) {
          setRejectErr(err.serverMessage);
          return;
        }
        if (err.httpStatus === 409) {
          toast.error('既に承認済 / 差戻済のため差戻しできません');
          setRejectOpen(false);
          return;
        }
        if (err.httpStatus === 404) {
          toast.error('対象の請求書が見つかりません');
          setRejectOpen(false);
          return;
        }
      }
      handleServerError(err, 'reject');
    } finally {
      setRejectLoading(false);
    }
  };

  const openDelete = () => {
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!id) return;
    const actorId = getActorId();
    if (!actorId) {
      toast.error('Actor IDが設定されていません。ヘッダー右上から設定してください。');
      return;
    }
    setDeleteLoading(true);
    try {
      await apiClient.deleteInvoice(id, actorId);
      toast.success('削除しました');
      setDeleteOpen(false);
      navigate('/');
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.httpStatus === 409) {
          toast.error('承認済の請求書は削除できません');
          setDeleteOpen(false);
          return;
        }
        if (err.httpStatus === 404) {
          toast.error('対象の請求書が見つかりません');
          setDeleteOpen(false);
          navigate('/');
          return;
        }
      }
      handleServerError(err, 'delete');
    } finally {
      setDeleteLoading(false);
    }
  };

  const openResubmit = () => {
    if (!invoice) return;
    setResubmitValues({
      invoice_amount: String(invoice.invoice_amount),
      purchase_order_amount: String(invoice.purchase_order_amount),
      due_date: invoice.due_date,
    });
    setResubmitErr(null);
    setResubmitOpen(true);
  };

  const handleResubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!invoice || !id) return;
    setResubmitErr(null);

    const payload: ResubmitPayload = {};
    const newInvoiceAmount = Number(resubmitValues.invoice_amount);
    const newPoAmount = Number(resubmitValues.purchase_order_amount);

    if (
      resubmitValues.invoice_amount !== '' &&
      Number.isFinite(newInvoiceAmount) &&
      newInvoiceAmount !== invoice.invoice_amount
    ) {
      if (!Number.isInteger(newInvoiceAmount) || newInvoiceAmount < 0) {
        setResubmitErr('請求金額は0以上の整数で入力してください');
        return;
      }
      payload.invoice_amount = newInvoiceAmount;
    }
    if (
      resubmitValues.purchase_order_amount !== '' &&
      Number.isFinite(newPoAmount) &&
      newPoAmount !== invoice.purchase_order_amount
    ) {
      if (!Number.isInteger(newPoAmount) || newPoAmount < 0) {
        setResubmitErr('発注金額は0以上の整数で入力してください');
        return;
      }
      payload.purchase_order_amount = newPoAmount;
    }
    if (resubmitValues.due_date !== '' && resubmitValues.due_date !== invoice.due_date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(resubmitValues.due_date)) {
        setResubmitErr('日付形式 (YYYY-MM-DD) で入力してください');
        return;
      }
      payload.due_date = resubmitValues.due_date;
    }

    if (Object.keys(payload).length === 0) {
      setResubmitErr('少なくとも1つのフィールドを変更してください');
      return;
    }

    const actorId = getActorId();
    if (!actorId) {
      toast.error('Actor IDが設定されていません。ヘッダー右上から設定してください。');
      return;
    }

    setResubmitLoading(true);
    try {
      await apiClient.resubmitInvoice(id, payload, actorId);
      toast.success('再提出しました');
      setResubmitOpen(false);
      await fetchInvoice();
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.httpStatus === 400) {
          setResubmitErr(err.serverMessage);
          return;
        }
        if (err.httpStatus === 409) {
          toast.error('rejected 状態の請求書のみ再提出できます');
          return;
        }
        if (err.httpStatus === 404) {
          toast.error('対象の請求書が見つかりません');
          return;
        }
      }
      handleServerError(err, 'resubmit');
    } finally {
      setResubmitLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center text-gray-500 py-12" aria-busy="true">
        読み込み中...
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto">
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md mb-4"
        >
          請求書が見つかりません
        </div>
        <Button variant="primary" onClick={() => navigate('/')}>
          一覧へ戻る
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md mb-4"
        >
          <p className="mb-2">{error}</p>
          <Button variant="secondary" onClick={() => void fetchInvoice()}>
            再試行
          </Button>
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  const inputBase =
    'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

  const amountDiff =
    invoice.status === 'mismatch'
      ? Math.abs(invoice.invoice_amount - invoice.purchase_order_amount)
      : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <Link to="/" className="text-primary-500 hover:underline text-sm">
          ← 一覧へ戻る
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">請求書詳細</h1>
        <StatusBadge status={invoice.status} />
      </div>

      <div className="bg-white p-6 rounded-md shadow-sm border border-gray-300 mb-6">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500">ID</dt>
            <dd className="font-mono text-xs text-gray-700 break-all">{invoice.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">請求番号</dt>
            <dd>{invoice.invoice_number}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">取引先ID</dt>
            <dd>{invoice.vendor_id}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">支払期限</dt>
            <dd>{formatDate(invoice.due_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">請求金額</dt>
            <dd className="font-mono">{formatJpy(invoice.invoice_amount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">発注金額</dt>
            <dd className="font-mono">{formatJpy(invoice.purchase_order_amount)}</dd>
          </div>
          {invoice.status === 'mismatch' && (
            <div className="sm:col-span-2">
              <p className="text-red-600 font-mono">差額: {formatJpy(amountDiff)}</p>
            </div>
          )}
          <div>
            <dt className="text-xs text-gray-500">登録日時</dt>
            <dd>{formatDateTime(invoice.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">更新日時</dt>
            <dd>{formatDateTime(invoice.updated_at)}</dd>
          </div>
          {invoice.status === 'approved' && invoice.approver_id && (
            <>
              <div>
                <dt className="text-xs text-gray-500">承認者</dt>
                <dd>{invoice.approver_id}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">承認日時</dt>
                <dd>{invoice.approved_at ? formatDateTime(invoice.approved_at) : ''}</dd>
              </div>
            </>
          )}
          {invoice.status === 'rejected' && (
            <>
              <div className="sm:col-span-2">
                <dt className="text-xs text-gray-500">差戻し理由</dt>
                <dd className="border-l-4 border-gray-300 pl-3 text-gray-700">
                  {invoice.rejection_reason}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">差戻し者</dt>
                <dd>{invoice.rejected_by}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">差戻し日時</dt>
                <dd>{invoice.rejected_at ? formatDateTime(invoice.rejected_at) : ''}</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      <div className="flex gap-2 justify-between flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {invoice.status === 'pending' && (
            <>
              <Button variant="primary" onClick={() => void handleApprove()}>
                承認
              </Button>
              <Button variant="danger" onClick={openReject}>
                差戻し
              </Button>
            </>
          )}
          {invoice.status === 'mismatch' && (
            <Button variant="danger" onClick={openReject}>
              差戻し
            </Button>
          )}
          {invoice.status === 'rejected' && (
            <Button variant="primary" onClick={openResubmit}>
              編集して再提出
            </Button>
          )}
          {invoice.status === 'approved' && (
            <p className="text-sm text-gray-500">承認済の請求書は変更できません</p>
          )}
        </div>
        <div>
          {invoice.status !== 'approved' && (
            <Button variant="danger" onClick={openDelete}>
              削除
            </Button>
          )}
        </div>
      </div>

      {resubmitOpen && (
        <form
          onSubmit={handleResubmit}
          className="bg-white p-6 rounded-md shadow-sm border border-gray-300 mt-6"
          aria-label="再提出フォーム"
        >
          <h2 className="text-lg font-semibold mb-4">編集して再提出</h2>
          <FormField id="resubmit-invoice-number" label="請求番号 (編集不可)">
            <input
              type="text"
              value={invoice.invoice_number}
              readOnly
              className={`${inputBase} bg-gray-100`}
            />
          </FormField>
          <FormField id="resubmit-vendor-id" label="取引先ID (編集不可)">
            <input
              type="text"
              value={invoice.vendor_id}
              readOnly
              className={`${inputBase} bg-gray-100`}
            />
          </FormField>
          <FormField id="resubmit-invoice-amount" label="請求金額 (円)">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={resubmitValues.invoice_amount}
              onChange={(e) =>
                setResubmitValues((p) => ({ ...p, invoice_amount: e.target.value }))
              }
              className={inputBase}
            />
          </FormField>
          <FormField id="resubmit-po-amount" label="発注金額 (円)">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={resubmitValues.purchase_order_amount}
              onChange={(e) =>
                setResubmitValues((p) => ({ ...p, purchase_order_amount: e.target.value }))
              }
              className={inputBase}
            />
          </FormField>
          <FormField id="resubmit-due-date" label="支払期限">
            <input
              type="date"
              value={resubmitValues.due_date}
              onChange={(e) => setResubmitValues((p) => ({ ...p, due_date: e.target.value }))}
              className={inputBase}
            />
          </FormField>
          {resubmitErr && (
            <p role="alert" className="mt-1 text-xs text-red-600 mb-3">
              {resubmitErr}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => setResubmitOpen(false)}
              disabled={resubmitLoading}
            >
              キャンセル
            </Button>
            <Button type="submit" variant="primary" disabled={resubmitLoading}>
              {resubmitLoading ? '送信中…' : '再提出する'}
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={rejectOpen}
        title="請求書を差戻しますか?"
        body={
          <div>
            <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700 mb-2">
              差戻し理由
              <span className="text-red-500 ml-1" aria-hidden="true">
                *
              </span>
            </label>
            <textarea
              id="reject-reason"
              rows={4}
              maxLength={500}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              aria-required="true"
              aria-invalid={rejectErr ? true : undefined}
              className={inputBase}
            />
            {rejectErr && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {rejectErr}
              </p>
            )}
          </div>
        }
        confirmLabel={rejectLoading ? '送信中…' : '差戻す'}
        cancelLabel="キャンセル"
        confirmVariant="danger"
        loading={rejectLoading}
        confirmDisabled={rejectReason.trim().length === 0}
        onConfirm={handleReject}
        onCancel={() => setRejectOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="請求書を削除しますか?"
        body={<p>この操作は取り消せません。</p>}
        requireConfirmText="削除"
        confirmLabel={deleteLoading ? '削除中…' : '削除'}
        cancelLabel="キャンセル"
        confirmVariant="danger"
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

export default InvoiceDetailPage;
