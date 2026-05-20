/**
 * refundService.ts — Complete refund and return management
 * 
 * Handles:
 * - Full and partial refunds
 * - Return item management (adds product back to inventory)
 * - Refund reason tracking
 * - Manager PIN verification for high-value refunds
 * - Refund status tracking (pending, approved, processed, failed)
 * - Original payment method refund routing
 */

import type { Sale, Refund, UserProfile } from "../schemas";
import { getSales, getRefunds as getRefundsFromData, createRefund, getProduct, updateProduct } from "./dataService";
import { verifyManagerPIN, requiresManagerApproval, logTransaction } from "./securityService";
import { generateId, now } from "../utils";

export type RefundReason = "damaged" | "wrong_item" | "customer_changed_mind" | "other";
export type RefundStatus = "pending_approval" | "approved" | "processing" | "completed" | "failed";

export interface RefundRequest {
  saleId: string;
  items: { productId: string; productName: string; quantity: number; price: number }[];
  amount: number;
  reason: RefundReason;
  reasonNote?: string;
  requiresApproval?: boolean;
}

export interface ApprovedRefund extends Refund {
  status: RefundStatus;
  approvedBy?: string;
  approvedAt?: string;
  processedAt?: string;
  failureReason?: string;
}

const REFUNDS_STATUS_KEY = "storehub_refunds_status";

// ─── Refund Processing ────────────────────────────────────────────────────────

export async function processRefund(
  request: RefundRequest,
  profile: UserProfile | null,
  employeeId: string,
  employeeName: string,
  managerPIN?: string,
): Promise<{
  success: boolean;
  refund?: ApprovedRefund;
  error?: string;
  requiresApproval?: boolean;
}> {
  try {
    // Check if manager approval is required
    const needsApproval = requiresManagerApproval(request.amount, profile);

    if (needsApproval && !managerPIN) {
      return {
        success: false,
        error: "Manager PIN required for refunds over threshold",
        requiresApproval: true,
      };
    }

    // Verify manager PIN if required
    if (needsApproval && managerPIN) {
      const pinVerification = verifyManagerPIN(managerPIN, profile);
      if (!pinVerification.valid) {
        return {
          success: false,
          error: pinVerification.error,
        };
      }
    }

    // Create refund record
    const refund: ApprovedRefund = {
      id: generateId(),
      saleId: request.saleId,
      items: request.items,
      amount: request.amount,
      reason: request.reason,
      reasonNote: request.reasonNote,
      createdAt: now(),
      paymentMethod: "refund",
      status: "approved",
      approvedBy: needsApproval ? profile?.id : undefined,
      approvedAt: needsApproval ? now() : undefined,
    };

    // Save refund
    const savedRefund = await createRefund({
      saleId: request.saleId,
      items: request.items,
      amount: request.amount,
      reason: request.reason,
      reasonNote: request.reasonNote,
      paymentMethod: "refund",
    });

    // Return refunded items to inventory if the product exists
    for (const item of request.items) {
      const product = await getProduct(item.productId);
      if (product) {
        await updateProduct(product.id, {
          quantity: (product.quantity || 0) + item.quantity,
        });
      }
    }

    // Log the refund transaction
    logTransaction({
      type: "refund",
      amount: request.amount,
      employeeId,
      employeeName,
      description: `Refund - ${request.reason}: ${request.reasonNote || ""}`,
      ...(needsApproval && {
        managerApproval: {
          managerId: profile?.id || "unknown",
          managerName: profile?.businessName || "Manager",
          timestamp: now(),
        },
      }),
    });

    // Mark refund as processed
    markRefundProcessed(savedRefund.id);

    return {
      success: true,
      refund: { ...savedRefund, status: "completed" } as ApprovedRefund,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Refund processing failed";

    logTransaction({
      type: "refund",
      amount: request.amount,
      employeeId,
      employeeName,
      description: `Refund FAILED - ${request.reason}: ${errorMessage}`,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ─── Refund Status Management ──────────────────────────────────────────────────

export function markRefundProcessed(refundId: string): void {
  const status = JSON.parse(localStorage.getItem(REFUNDS_STATUS_KEY) || "{}") as Record<
    string,
    { status: RefundStatus; processedAt: string }
  >;

  status[refundId] = {
    status: "completed",
    processedAt: now(),
  };

  localStorage.setItem(REFUNDS_STATUS_KEY, JSON.stringify(status));
}

export function getRefundStatus(refundId: string): RefundStatus {
  const status = JSON.parse(localStorage.getItem(REFUNDS_STATUS_KEY) || "{}") as Record<
    string,
    { status: RefundStatus }
  >;

  return status[refundId]?.status || "pending_approval";
}

export function getAllRefundStatuses(): Record<string, RefundStatus> {
  const status = JSON.parse(localStorage.getItem(REFUNDS_STATUS_KEY) || "{}") as Record<
    string,
    { status: RefundStatus }
  >;

  const result: Record<string, RefundStatus> = {};
  for (const [refundId, data] of Object.entries(status)) {
    result[refundId] = data.status;
  }

  return result;
}

// ─── Refund History & Analytics ────────────────────────────────────────────────

export async function getRefundHistory(dateRange?: { start: string; end: string }) {
  const refunds = await getRefundsFromData();
  const statuses = getAllRefundStatuses();

  return refunds
    .map((r) => ({
      ...r,
      status: statuses[r.id] || "pending_approval",
    }))
    .filter((r) => {
      if (!dateRange) return true;

      const refundDate = new Date(r.createdAt).toISOString().split("T")[0];
      return refundDate >= dateRange.start && refundDate <= dateRange.end;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export interface RefundSummary {
  totalRefunds: number;
  totalAmount: number;
  averageRefund: number;
  reasonBreakdown: Record<RefundReason, { count: number; amount: number; percentage: number }>;
  statusBreakdown: Record<RefundStatus, number>;
}

export async function getRefundSummary(dateRange?: { start: string; end: string }): Promise<RefundSummary> {
  const refundHistory = await getRefundHistory(dateRange);

  const totalAmount = refundHistory.reduce((sum, r) => sum + r.amount, 0);
  const totalRefunds = refundHistory.length;

  const reasonBreakdown: Record<
    RefundReason,
    { count: number; amount: number; percentage: number }
  > = {
    damaged: { count: 0, amount: 0, percentage: 0 },
    wrong_item: { count: 0, amount: 0, percentage: 0 },
    customer_changed_mind: { count: 0, amount: 0, percentage: 0 },
    other: { count: 0, amount: 0, percentage: 0 },
  };

  for (const refund of refundHistory) {
    const reason = (refund.reason || "other") as RefundReason;
    reasonBreakdown[reason].count++;
    reasonBreakdown[reason].amount += refund.amount;
    reasonBreakdown[reason].percentage = Math.round(
      (reasonBreakdown[reason].amount / totalAmount) * 100,
    );
  }

  const statusBreakdown: Record<RefundStatus, number> = {
    pending_approval: 0,
    approved: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  for (const refund of refundHistory) {
    const status = refund.status as RefundStatus;
    statusBreakdown[status]++;
  }

  return {
    totalRefunds,
    totalAmount,
    averageRefund: totalRefunds > 0 ? totalAmount / totalRefunds : 0,
    reasonBreakdown,
    statusBreakdown,
  };
}

// ─── Partial Refund Utilities ──────────────────────────────────────────────────

export function calculatePartialRefund(items: Sale["items"], selections: { index: number; quantity: number }[]): number {
  return selections.reduce((sum, sel) => {
    const item = items[sel.index];
    return sum + item.price * sel.quantity;
  }, 0);
}

export function validatePartialRefund(
  saleItems: Sale["items"],
  refundItems: { index: number; quantity: number }[],
): { valid: boolean; error?: string } {
  for (const selection of refundItems) {
    const item = saleItems[selection.index];

    if (!item) {
      return { valid: false, error: "Invalid item index" };
    }

    if (selection.quantity > item.quantity) {
      return { valid: false, error: `Cannot refund more than ${item.quantity} of this item` };
    }

    if (selection.quantity <= 0) {
      return { valid: false, error: "Refund quantity must be greater than 0" };
    }
  }

  return { valid: true };
}
