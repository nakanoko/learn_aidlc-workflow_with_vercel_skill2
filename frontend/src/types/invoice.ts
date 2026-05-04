export type InvoiceStatus = 'pending' | 'approved' | 'rejected' | 'mismatch';

export type Invoice = {
  id: string;
  invoice_number: string;
  vendor_id: string;
  invoice_amount: number;
  purchase_order_amount: number;
  due_date: string;
  status: InvoiceStatus;
  approver_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateInvoicePayload = {
  invoice_number: string;
  vendor_id: string;
  invoice_amount: number;
  purchase_order_amount: number;
  due_date: string;
};

export type ResubmitPayload = {
  invoice_amount?: number;
  purchase_order_amount?: number;
  due_date?: string;
};

export type ListInvoicesResponse = {
  items: Invoice[];
  total: number;
};
