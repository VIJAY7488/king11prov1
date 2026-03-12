export enum WithdrawalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum WithdrawalMethod {
  UPI = 'UPI',
  BANK = 'BANK',
}

export interface CreateWithdrawalDTO {
  amount: number;
  method: WithdrawalMethod;
  upiId?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  note?: string;
}

export interface ReviewWithdrawalDTO {
  status: WithdrawalStatus.APPROVED | WithdrawalStatus.REJECTED;
  adminNote?: string;
}

export interface WithdrawalQueryParams {
  status?: WithdrawalStatus;
  page?: number;
  limit?: number;
}

export interface WithdrawalPublic {
  id: string;
  userId: string;
  userName?: string;
  userMobile?: string;
  amount: number;
  method: WithdrawalMethod;
  upiId?: string;
  accountHolderName?: string;
  accountNumberMasked?: string;
  ifscCode?: string;
  status: WithdrawalStatus;
  adminNote?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  walletTransactionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewWithdrawalResult {
  withdrawal: WithdrawalPublic;
  walletBalance: number;
  walletTransactionId?: string;
}

export interface PaginatedWithdrawals {
  withdrawals: WithdrawalPublic[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
