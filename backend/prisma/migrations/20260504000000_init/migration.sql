-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoice_number" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "invoice_amount" INTEGER NOT NULL,
    "purchase_order_amount" INTEGER NOT NULL,
    "due_date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "approver_id" TEXT,
    "approved_at" DATETIME,
    "rejection_reason" TEXT,
    "rejected_by" TEXT,
    "rejected_at" DATETIME,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "before_status" TEXT,
    "after_status" TEXT,
    "note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_deleted_at_idx" ON "Invoice"("deleted_at");

-- CreateIndex
CREATE INDEX "Invoice_created_at_idx" ON "Invoice"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_vendor_id_invoice_number_key" ON "Invoice"("vendor_id", "invoice_number");

-- CreateIndex
CREATE INDEX "AuditLog_invoice_id_idx" ON "AuditLog"("invoice_id");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");
