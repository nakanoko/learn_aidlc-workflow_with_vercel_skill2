import { prisma } from './prisma';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { AuditLogRepository } from '@/repositories/auditLogRepository';
import { InvoiceService } from '@/services/invoiceService';
import { AuditLogService } from '@/services/auditLogService';

const invoiceRepo = new InvoiceRepository(prisma);
const auditRepo = new AuditLogRepository(prisma);
const auditLogService = new AuditLogService(auditRepo);
const invoiceService = new InvoiceService(invoiceRepo, auditLogService, prisma);

export { invoiceService, auditLogService, prisma };
