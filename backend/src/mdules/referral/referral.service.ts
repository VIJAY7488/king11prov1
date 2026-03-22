import { ClientSession, Types } from 'mongoose';
import AppError from '../../utils/AppError';
import Deposit from '../deposit/deposit.model';
import { DepositStatus } from '../deposit/deposite.types';
import User from '../user/users.model';
import Transaction from '../wallet/wallet.model';
import { TransactionStatus, TransactionType } from '../wallet/wallet.types';
import Referral, { REFERRAL_REWARD_AMOUNT } from './referral.model';
import { ReferralHistoryQuery, ReferralHistoryResponse, ReferralRewardStatus, ReferralSummaryResponse } from './referral.types';

export class ReferralService {
  async createPendingReferral(referrerUserId: string, referredUserId: string, referralCodeUsed: string): Promise<void> {
    const existing = await Referral.findOne({ referredUserId: new Types.ObjectId(referredUserId) });
    if (existing) return;

    try {
      await Referral.create({
        referrerUserId: new Types.ObjectId(referrerUserId),
        referredUserId: new Types.ObjectId(referredUserId),
        referralCodeUsed: referralCodeUsed.trim().toUpperCase(),
        rewardAmount: REFERRAL_REWARD_AMOUNT,
        rewardStatus: ReferralRewardStatus.PENDING,
      });
    } catch (err: any) {
      if (err?.code === 11000) return;
      throw err;
    }
  }

  async rewardReferrerOnFirstApprovedDeposit(referredUserId: string, depositId: string, session: ClientSession): Promise<void> {
    const referral = await Referral.findOne({ referredUserId: new Types.ObjectId(referredUserId) }).session(session);
    if (!referral) return;
    if (referral.rewardStatus === ReferralRewardStatus.REWARDED) return;

    const approvedCount = await Deposit.countDocuments({
      userId: new Types.ObjectId(referredUserId),
      status: DepositStatus.APPROVED,
    }).session(session);

    if (approvedCount !== 1) return;

    const now = new Date();

    if (!referral.referredFirstDepositId) {
      referral.referredFirstDepositId = new Types.ObjectId(depositId);
      referral.referredFirstDepositAt = now;
      referral.rewardStatus = ReferralRewardStatus.QUALIFIED;
      await referral.save({ session });
    }

    const walletTxnRef = `REFERRAL:BONUS:${referral._id.toString()}`;
    const existingTxn = await Transaction.findOne({ referenceId: walletTxnRef }).session(session);

    if (existingTxn) {
      referral.rewardStatus = ReferralRewardStatus.REWARDED;
      referral.rewardTxnReferenceId = walletTxnRef;
      referral.rewardedAt = referral.rewardedAt ?? now;
      await referral.save({ session });
      return;
    }

    const referrer = await User.findOneAndUpdate(
      { _id: referral.referrerUserId, isActive: true },
      {
        $inc: {
          walletBalance: referral.rewardAmount,
          nonWithdrawableBonusBalance: referral.rewardAmount,
        },
      },
      { new: true, session }
    );

    if (!referrer) {
      return;
    }

    const balanceAfter = referrer.walletBalance;
    const balanceBefore = balanceAfter - referral.rewardAmount;

    await Transaction.create(
      [{
        userId: referrer._id,
        type: TransactionType.REFERRAL_BONUS,
        status: TransactionStatus.SUCCESS,
        amount: referral.rewardAmount,
        balanceBefore,
        balanceAfter,
        referenceId: walletTxnRef,
        metadata: {
          referredUserId,
          referralId: referral._id.toString(),
          rewardType: 'FIRST_DEPOSIT',
          nonWithdrawable: true,
        },
      }],
      { session }
    );

    referral.rewardStatus = ReferralRewardStatus.REWARDED;
    referral.rewardTxnReferenceId = walletTxnRef;
    referral.rewardedAt = now;
    await referral.save({ session });
  }

  async getMyReferralSummary(userId: string): Promise<ReferralSummaryResponse> {
    const user = await User.findById(userId).select('referralCode');
    if (!user) throw new AppError('User not found.', 404);

    const [agg] = await Referral.aggregate([
      { $match: { referrerUserId: new Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalReferrals: { $sum: 1 },
          rewardedReferrals: {
            $sum: {
              $cond: [{ $eq: ['$rewardStatus', ReferralRewardStatus.REWARDED] }, 1, 0],
            },
          },
          pendingReferrals: {
            $sum: {
              $cond: [{ $ne: ['$rewardStatus', ReferralRewardStatus.REWARDED] }, 1, 0],
            },
          },
          totalBonusEarned: {
            $sum: {
              $cond: [{ $eq: ['$rewardStatus', ReferralRewardStatus.REWARDED] }, '$rewardAmount', 0],
            },
          },
        },
      },
    ]);

    return {
      referralCode: user.referralCode,
      totalReferrals: agg?.totalReferrals ?? 0,
      rewardedReferrals: agg?.rewardedReferrals ?? 0,
      pendingReferrals: agg?.pendingReferrals ?? 0,
      totalBonusEarned: agg?.totalBonusEarned ?? 0,
      rewardPerReferral: REFERRAL_REWARD_AMOUNT,
    };
  }

  async listMyReferrals(userId: string, query: ReferralHistoryQuery): Promise<ReferralHistoryResponse> {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      Referral.find({ referrerUserId: new Types.ObjectId(userId) })
        .populate('referredUserId', 'name mobileNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Referral.countDocuments({ referrerUserId: new Types.ObjectId(userId) }),
    ]);

    return {
      referrals: rows.map((row: any) => ({
        id: row._id.toString(),
        referredUserId: row.referredUserId?._id?.toString() ?? row.referredUserId?.toString(),
        referredUserName: row.referredUserId?.name,
        referredUserMobile: row.referredUserId?.mobileNumber,
        referralCodeUsed: row.referralCodeUsed,
        rewardAmount: row.rewardAmount,
        rewardStatus: row.rewardStatus,
        referredFirstDepositAt: row.referredFirstDepositAt,
        rewardedAt: row.rewardedAt,
        createdAt: row.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export default new ReferralService();
