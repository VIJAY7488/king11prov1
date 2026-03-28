import { Types } from 'mongoose';



// ── Enums ─────────────────────────────────────────────────────────────────────

export enum TransactionType {
    DEPOSIT      = 'DEPOSIT',      // credited via approved Deposit request
    DEPOSIT_BONUS = 'DEPOSIT_BONUS', // non-withdrawable bonus on eligible deposits
    REFERRAL_BONUS = 'REFERRAL_BONUS', // non-withdrawable bonus credited to referrer
    DEDUCTION    = 'DEDUCTION',    // manual admin deduction
    REFUND       = 'REFUND',       // contest entry refund
    JOIN_CONTEST = 'JOIN_CONTEST', // contest entry fee
    WIN_PRIZE    = 'WIN_PRIZE',    // prize credited on contest result
    WITHDRAWAL   = 'WITHDRAWAL',   // user withdrawal request (pending/success/reversed)
    TRADE_BUY_AMM = 'TRADE_BUY_AMM', // AMM prediction trade debit
    TRADE_SELL_AMM = 'TRADE_SELL_AMM', // AMM prediction trade credit
    DEBIT = 'DEBIT',
    CREDIT = 'CREDIT',
    LOCK = 'LOCK',
    UNLOCK = 'UNLOCK',
}


export enum TransactionStatus {
    PENDING   = 'PENDING',
    SUCCESS   = 'SUCCESS',
    FAILED    = 'FAILED',
    REVERSED  = 'REVERSED',
}

export enum WalletTxnReason {
  TRADE = 'TRADE',
  SETTLEMENT = 'SETTLEMENT',
  REFUND = 'REFUND',
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  ORDER_PLACE = 'ORDER_PLACE',
  ORDER_CANCEL = 'ORDER_CANCEL',
  ORDER_EXECUTION = 'ORDER_EXECUTION',
}


// ── Internal Credit DTO (called by deposit.service on approval) ───────────────
// Not exposed via HTTP — internal service-to-service call only.
export interface CreditFromDepositDTO {
    amount: number;
    depositId: string;    // Deposit._id — used to build idempotency key
    refNumber: string;    // payment reference for description
    approvedBy: string;   // admin userId
}

export interface CreditDepositBonusDTO {
    bonusAmount: number;
    depositId: string;
    refNumber: string;
    approvedBy: string;
    bonusPercent: number;
}


// ── HTTP Request DTOs ─────────────────────────────────────────────────────────

export interface DeductDTO {
  amount: number;
  referenceId?: string;
}

export interface WalletMutationDTO {
  amount: number;
  referenceId: string;
  reason: WalletTxnReason;
  metadata?: Record<string, unknown>;
}

export interface WalletTransferLockedToDebitDTO {
  amount: number;
  referenceId: string;
  reason?: WalletTxnReason;
  metadata?: Record<string, unknown>;
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
  reason?: WalletTxnReason;
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
  lockedBalance: number;
  availableBalance: number;
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
