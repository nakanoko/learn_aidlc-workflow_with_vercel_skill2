import { useCallback, useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/apiClient';
import { AppApiError } from '../api/AppApiError';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatDateTime, formatJpy } from '../lib/format';
import type { Invoice, InvoiceStatus } from '../types/invoice';

type StatusFilter = InvoiceStatus | '';

export function InvoiceListPage(): JSX.Element {
  const navigate = useNavigate();
  const [items, setItems] = useState<Invoice[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [status, setStatus] = useState<StatusFilter>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(async (currentStatus: StatusFilter) => {
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      const params = currentStatus === '' ? undefined : { status: currentStatus };
      const res = await apiClient.listInvoices(params);
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof AppApiError) {
        setError(err.serverMessage);
      } else {
        setError('ネットワークエラーが発生しました');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList(status);
  }, [status, fetchList]);

  const handleRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`/invoices/${id}`);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">請求書一覧</h1>
        <Button variant="primary" onClick={() => navigate('/invoices/new')}>
          + 新規登録
        </Button>
      </div>

      <div className="mb-4">
        <label htmlFor="status-filter" className="text-sm font-medium text-gray-700 mr-2">
          ステータス:
        </label>
        <select
          id="status-filter"
          aria-label="ステータス"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">すべて</option>
          <option value="pending">承認待ち</option>
          <option value="mismatch">不一致</option>
          <option value="approved">承認済</option>
          <option value="rejected">差戻し済</option>
        </select>
      </div>

      {loading && (
        <div className="text-center text-gray-500 py-8" aria-busy="true">
          読み込み中...
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md mb-4"
        >
          <p className="mb-2">{error}</p>
          <Button variant="secondary" onClick={() => void fetchList(status)}>
            再試行
          </Button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="mb-4">該当する請求書がありません。</p>
          <Button variant="primary" onClick={() => navigate('/invoices/new')}>
            + 新規登録
          </Button>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="overflow-x-auto bg-white rounded-md shadow-sm border border-gray-300">
            <table className="min-w-full" aria-busy={loading}>
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">
                    請求番号
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">取引先</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase">
                    請求金額
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase">
                    発注金額
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">期限</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">
                    ステータス
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">登録日時</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr
                    key={inv.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    onKeyDown={(e) => handleRowKeyDown(e, inv.id)}
                    className="even:bg-gray-50 hover:bg-primary-100 cursor-pointer border-b border-gray-200"
                    aria-label={`請求書 ${inv.invoice_number} を開く`}
                  >
                    <td className="px-4 py-3 text-sm">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm">{inv.vendor_id}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">
                      {formatJpy(inv.invoice_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono">
                      {formatJpy(inv.purchase_order_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm">{formatDate(inv.due_date)}</td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700">
                      {formatDateTime(inv.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-gray-500">全 {total} 件</p>
        </>
      )}
    </div>
  );
}

export default InvoiceListPage;
