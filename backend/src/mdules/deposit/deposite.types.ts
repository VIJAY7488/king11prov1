

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum DepositStatus {
  PENDING   = 'PENDING',   // submitted, awaiting admin approval
  APPROVED  = 'APPROVED',  // admin approved — wallet credited
  REJECTED  = 'REJECTED',  // admin rejected — no wallet change
};


// ── Request DTOs ──────────────────────────────────────────────────────────────

export interface CreateDepositDTO {
  amount: number;
  refNumber: string;         // payment reference / UTR number — always a string
  bonusCode?: string;
}

export interface ReviewDepositDTO {
  status: DepositStatus.APPROVED | DepositStatus.REJECTED;
};

export interface DepositQueryParams {
  status?: DepositStatus;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

// ── Response Shapes ───────────────────────────────────────────────────────────

export interface DepositPublic {
  id: string;
  userId: string;
  amount: number;
  refNumber: string;
  bonusCode?: string;
  status: DepositStatus;
  reviewedAt?: Date;
  walletTransactionId?: string;  // set after approval credits the wallet
  createdAt: Date;
  updatedAt: Date;
}


// Returned only on APPROVE — includes the user's new wallet balance
export interface ApproveDepositResult {
  deposit: DepositPublic;
  walletBalance: number;         // balance after credit
  walletTransactionId: string;   // cross-link to the wallet ledger
  bonusCredited: number;
  walletBonusTransactionId?: string;
}


export interface PaginatedDeposits {
  deposits: DepositPublic[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
