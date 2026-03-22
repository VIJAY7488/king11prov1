export enum ReferralRewardStatus {
  PENDING = 'PENDING',
  QUALIFIED = 'QUALIFIED',
  REWARDED = 'REWARDED',
}

export interface ReferralHistoryQuery {
  page?: number;
  limit?: number;
}

export interface ReferralHistoryItem {
  id: string;
  referredUserId: string;
  referredUserName?: string;
  referredUserMobile?: string;
  referralCodeUsed: string;
  rewardAmount: number;
  rewardStatus: ReferralRewardStatus;
  referredFirstDepositAt?: Date;
  rewardedAt?: Date;
  createdAt: Date;
}

export interface ReferralHistoryResponse {
  referrals: ReferralHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ReferralSummaryResponse {
  referralCode: string;
  totalReferrals: number;
  rewardedReferrals: number;
  pendingReferrals: number;
  totalBonusEarned: number;
  rewardPerReferral: number;
}
