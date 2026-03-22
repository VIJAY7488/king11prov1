import { Types } from 'mongoose';



// ── Enums ─────────────────────────────────────────────────────────────────────

export enum TransactionType {
    DEPOSIT      = 'DEPOSIT',      // credited via approved Deposit request
    REFERRAL_BONUS = 'REFERRAL_BONUS', // non-withdrawable bonus credited to referrer
    DEDUCTION    = 'DEDUCTION',    // manual admin deduction
    REFUND       = 'REFUND',       // contest entry refund
    JOIN_CONTEST = 'JOIN_CONTEST', // contest entry fee
    WIN_PRIZE    = 'WIN_PRIZE',    // prize credited on contest result
    WITHDRAWAL   = 'WITHDRAWAL',   // user withdrawal request (pending/success/reversed)
}


export enum TransactionStatus {
    PENDING   = 'PENDING',
    SUCCESS   = 'SUCCESS',
    FAILED    = 'FAILED',
    REVERSED  = 'REVERSED',
}


// ── Internal Credit DTO (called by deposit.service on approval) ───────────────
// Not exposed via HTTP — internal service-to-service call only.
export interface CreditFromDepositDTO {
    amount: number;
    depositId: string;    // Deposit._id — used to build idempotency key
    refNumber: string;    // payment reference for description
    approvedBy: string;   // admin userId
}


// ── HTTP Request DTOs ─────────────────────────────────────────────────────────

export interface DeductDTO {
  amount: number;
  referenceId?: string;
}

export interface JoinContestDTO {
  contestId: string;
  entryFee: number;
  contestName?: string;
}

// ── Response Shapes ───────────────────────────────────────────────────────────

export interface TransactionRecord {
  id: string;
  userId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface WalletSummary {
  userId: string;
  balance: number;
  totalDeposited: number;
  totalDeducted: number;
  transactionCount: number;
}

export interface WalletOperationResult {
  transaction: TransactionRecord;
  currentBalance: number;
}

export interface WalletBalanceSummary {
  totalBalance: number;
  withdrawableBalance: number;
  nonWithdrawableBonusBalance: number;
}

export interface PaginatedTransactions {
  transactions: TransactionRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TransactionQueryParams {
  page?: number;
  limit?: number;
  type?: TransactionType;
  status?: TransactionStatus;
  startDate?: string;
  endDate?: string;
}
