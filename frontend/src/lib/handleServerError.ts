import { AppApiError } from '../api/AppApiError';
import { toast } from '../components/Toast';

export type ErrorContext = 'create' | 'approve' | 'reject' | 'resubmit' | 'delete' | 'detail';

/**
 * Generic fallback error handler. Page-level handlers should map known
 * HTTP statuses inline (per source-of-truth table in functional-design §7.2.2)
 * and only delegate unexpected statuses or network errors here.
 */
export function handleServerError(err: unknown, _context: ErrorContext): void {
  if (!(err instanceof AppApiError)) {
    toast.error('ネットワークエラーが発生しました');
    return;
  }
  toast.error(`エラー: ${err.serverMessage || `HTTP ${err.httpStatus}`}`);
}
