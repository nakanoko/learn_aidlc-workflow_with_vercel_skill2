import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiClient } from '../api/apiClient';
import { AppApiError } from '../api/AppApiError';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { toast } from '../components/Toast';
import { getActorId } from '../lib/actor';
import { handleServerError } from '../lib/handleServerError';

const createInvoiceFormSchema = z.object({
  invoice_number: z
    .string()
    .trim()
    .min(1, '請求番号を入力してください')
    .max(50, '50文字以内で入力してください'),
  vendor_id: z
    .string()
    .trim()
    .min(1, '取引先IDを入力してください')
    .max(50, '50文字以内で入力してください'),
  invoice_amount: z.coerce
    .number({ invalid_type_error: '整数で入力してください' })
    .int('整数で入力してください')
    .min(0, '0以上の値を入力してください'),
  purchase_order_amount: z.coerce
    .number({ invalid_type_error: '整数で入力してください' })
    .int('整数で入力してください')
    .min(0, '0以上の値を入力してください'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付形式 (YYYY-MM-DD) で入力してください'),
});

type FormValues = {
  invoice_number: string;
  vendor_id: string;
  invoice_amount: string;
  purchase_order_amount: string;
  due_date: string;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const INITIAL_VALUES: FormValues = {
  invoice_number: '',
  vendor_id: '',
  invoice_amount: '',
  purchase_order_amount: '',
  due_date: '',
};

export function InvoiceCreatePage(): JSX.Element {
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [duplicateBanner, setDuplicateBanner] = useState<string | null>(null);

  const update = (key: keyof FormValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const mapServerErrorToField = (msg: string): keyof FormValues | null => {
    if (/invoice_number|請求番号/i.test(msg)) return 'invoice_number';
    if (/vendor_id|取引先/i.test(msg)) return 'vendor_id';
    if (/invoice_amount|請求金額/i.test(msg)) return 'invoice_amount';
    if (/purchase_order_amount|発注金額/i.test(msg)) return 'purchase_order_amount';
    if (/due_date|期限|日付/i.test(msg)) return 'due_date';
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDuplicateBanner(null);
    const parsed = createInvoiceFormSchema.safeParse(values);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      const next: FieldErrors = {};
      (Object.keys(flat) as Array<keyof FormValues>).forEach((k) => {
        const arr = flat[k];
        if (arr && arr.length > 0) next[k] = arr[0];
      });
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const actorId = getActorId();
      if (!actorId) {
        toast.error('Actor IDが設定されていません。ヘッダー右上から設定してください。');
        setSubmitting(false);
        return;
      }
      await apiClient.createInvoice(parsed.data, actorId);
      toast.success('請求書を登録しました');
      navigate('/');
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.httpStatus === 409) {
          setDuplicateBanner(
            'すでに登録済みです (同じ取引先IDと請求番号の組み合わせ)',
          );
        } else if (err.httpStatus === 400) {
          const field = mapServerErrorToField(err.serverMessage);
          if (field) {
            setErrors((prev) => ({ ...prev, [field]: err.serverMessage }));
          } else {
            toast.warning(err.serverMessage || '入力内容に誤りがあります');
          }
        } else if (err.httpStatus >= 500) {
          toast.error(`登録に失敗しました: ${err.serverMessage}`);
        } else {
          handleServerError(err, 'create');
        }
      } else {
        handleServerError(err, 'create');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputBase =
    'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';
  const inputErr = 'border-red-500';

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">請求書登録</h1>

      {duplicateBanner && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md mb-4"
        >
          {duplicateBanner}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="bg-white p-6 rounded-md shadow-sm border border-gray-300">
        <FormField id="invoice_number" label="請求番号" required error={errors.invoice_number}>
          <input
            type="text"
            value={values.invoice_number}
            onChange={(e) => update('invoice_number', e.target.value)}
            className={`${inputBase} ${errors.invoice_number ? inputErr : ''}`}
            maxLength={50}
          />
        </FormField>

        <FormField id="vendor_id" label="取引先ID" required error={errors.vendor_id}>
          <input
            type="text"
            value={values.vendor_id}
            onChange={(e) => update('vendor_id', e.target.value)}
            className={`${inputBase} ${errors.vendor_id ? inputErr : ''}`}
            maxLength={50}
          />
        </FormField>

        <FormField id="invoice_amount" label="請求金額 (円)" required error={errors.invoice_amount}>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={values.invoice_amount}
            onChange={(e) => update('invoice_amount', e.target.value)}
            className={`${inputBase} ${errors.invoice_amount ? inputErr : ''}`}
          />
        </FormField>

        <FormField
          id="purchase_order_amount"
          label="発注金額 (円)"
          required
          error={errors.purchase_order_amount}
        >
          <input
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={values.purchase_order_amount}
            onChange={(e) => update('purchase_order_amount', e.target.value)}
            className={`${inputBase} ${errors.purchase_order_amount ? inputErr : ''}`}
          />
        </FormField>

        <FormField id="due_date" label="支払期限" required error={errors.due_date}>
          <input
            type="date"
            value={values.due_date}
            onChange={(e) => update('due_date', e.target.value)}
            className={`${inputBase} ${errors.due_date ? inputErr : ''}`}
          />
        </FormField>

        <div className="flex gap-2 justify-end mt-6">
          <Button variant="ghost" onClick={() => navigate(-1)} disabled={submitting}>
            キャンセル
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? '登録中…' : '登録する'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default InvoiceCreatePage;
