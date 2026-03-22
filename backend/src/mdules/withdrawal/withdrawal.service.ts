import mongoose, { ClientSession, Types } from 'mongoose';
import AppError from '../../utils/AppError';
import User from '../user/users.model';
import Transaction from '../wallet/wallet.model';
import { TransactionStatus, TransactionType } from '../wallet/wallet.types';
import { IWithdrawal, Withdrawal } from './withdrawal.model';
import {
  CreateWithdrawalDTO,
  PaginatedWithdrawals,
  ReviewWithdrawalResult,
  WithdrawalPublic,
  WithdrawalQueryParams,
  WithdrawalStatus,
} from './withdrawal.types';

const maskAccountNumber = (accountNumber?: string): string | undefined => {
  if (!accountNumber) return undefined;
  if (accountNumber.length <= 4) return accountNumber;
  return `${'*'.repeat(Math.max(0, accountNumber.length - 4))}${accountNumber.slice(-4)}`;
};

const toWithdrawalPublic = (doc: IWithdrawal): WithdrawalPublic => ({
  id: (doc._id as Types.ObjectId).toString(),
  userId: doc.userId.toString(),
  amount: doc.amount,
  method: doc.method,
  upiId: doc.upiId,
  accountHolderName: doc.accountHolderName,
  accountNumberMasked: maskAccountNumber(doc.accountNumber),
  ifscCode: doc.ifscCode,
  status: doc.status,
  adminNote: doc.adminNote,
  reviewedBy: doc.reviewedBy?.toString(),
  reviewedAt: doc.reviewedAt,
  walletTransactionId: doc.walletTransactionId,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const withTransaction = async <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export class WithdrawalService {
  async createWithdrawal(userId: string, dto: CreateWithdrawalDTO): Promise<{ withdrawal: WithdrawalPublic; walletBalance: number }> {
    return withTransaction(async (session) => {
      const user = await User.findById(userId).session(session);
      if (!user) throw new AppError('User not found.', 404);
      if (!user.isActive) throw new AppError('Account is deactivated.', 403);

      if (user.withdrawableBalance < dto.amount) {
        throw new AppError('Insufficient withdrawable balance for withdrawal.', 402);
      }

      const withdrawalId = new Types.ObjectId();
      const walletTxnRef = `WITHDRAWAL:REQUEST:${withdrawalId.toString()}`;

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: new Types.ObjectId(userId),
          isActive: true,
          walletBalance: { $gte: dto.amount },
          withdrawableBalance: { $gte: dto.amount },
        },
        { $inc: { walletBalance: -dto.amount, withdrawableBalance: -dto.amount } },
        { new: true, session }
      );
      if (!updatedUser) throw new AppError('Insufficient balance or account deactivated during withdrawal.', 402);

      const balanceAfter = updatedUser.walletBalance;
      const balanceBefore = balanceAfter + dto.amount;

      await Transaction.create(
        [{
          userId: updatedUser._id,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.PENDING,
          amount: dto.amount,
          balanceBefore,
          balanceAfter,
          referenceId: walletTxnRef,
          metadata: { method: dto.method },
        }],
        { session }
      );

      const [withdrawal] = await Withdrawal.create(
        [{
          _id: withdrawalId,
          userId: updatedUser._id,
          amount: dto.amount,
          method: dto.method,
          upiId: dto.upiId || undefined,
          accountHolderName: dto.accountHolderName || undefined,
          accountNumber: dto.accountNumber || undefined,
          ifscCode: dto.ifscCode || undefined,
          note: dto.note || undefined,
          status: WithdrawalStatus.PENDING,
          walletTransactionId: walletTxnRef,
        }],
        { session }
      );

      return { withdrawal: toWithdrawalPublic(withdrawal), walletBalance: balanceAfter };
    });
  }

  async getWithdrawalById(withdrawalId: string, userId: string, isAdmin = false): Promise<WithdrawalPublic> {
    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) throw new AppError('Withdrawal not found.', 404);
    if (!isAdmin && withdrawal.userId.toString() !== userId) {
      throw new AppError('Not authorized to view this withdrawal.', 403);
    }
    return toWithdrawalPublic(withdrawal);
  }

  async listMyWithdrawals(userId: string, params: WithdrawalQueryParams): Promise<PaginatedWithdrawals> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (params.status) filter.status = params.status;

    const [rows, total] = await Promise.all([
      Withdrawal.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Withdrawal.countDocuments(filter),
    ]);

    return {
      withdrawals: rows.map(toWithdrawalPublic),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async listWithdrawals(params: WithdrawalQueryParams): Promise<PaginatedWithdrawals> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const filter: Record<string, unknown> = {};
    if (params.status) filter.status = params.status;

    const [rows, total] = await Promise.all([
      Withdrawal.find(filter)
        .populate('userId', 'name mobileNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Withdrawal.countDocuments(filter),
    ]);

    const withdrawals: WithdrawalPublic[] = rows.map((row: any) => ({
      id: row._id.toString(),
      userId: row.userId?._id?.toString() ?? row.userId?.toString(),
      userName: row.userId?.name,
      userMobile: row.userId?.mobileNumber,
      amount: row.amount,
      method: row.method,
      upiId: row.upiId,
      accountHolderName: row.accountHolderName,
      accountNumberMasked: maskAccountNumber(row.accountNumber),
      ifscCode: row.ifscCode,
      status: row.status,
      adminNote: row.adminNote,
      reviewedBy: row.reviewedBy?.toString(),
      reviewedAt: row.reviewedAt,
      walletTransactionId: row.walletTransactionId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return {
      withdrawals,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approveWithdrawal(withdrawalId: string, adminId: string, adminNote?: string): Promise<ReviewWithdrawalResult> {
    return withTransaction(async (session) => {
      const updated = await Withdrawal.findOneAndUpdate(
        { _id: new Types.ObjectId(withdrawalId), status: WithdrawalStatus.PENDING },
        {
          $set: {
            status: WithdrawalStatus.APPROVED,
            reviewedBy: new Types.ObjectId(adminId),
            reviewedAt: new Date(),
            adminNote: adminNote || undefined,
          },
        },
        { new: true, session }
      );

      if (!updated) throw new AppError('Withdrawal was already reviewed or does not exist.', 409);

      if (updated.walletTransactionId) {
        await Transaction.findOneAndUpdate(
          { referenceId: updated.walletTransactionId },
          { $set: { status: TransactionStatus.SUCCESS } },
          { session }
        );
      }

      const user = await User.findById(updated.userId).session(session);
      if (!user) throw new AppError('User not found.', 404);

      return {
        withdrawal: toWithdrawalPublic(updated),
        walletBalance: user.walletBalance,
        walletTransactionId: updated.walletTransactionId,
      };
    });
  }

  async rejectWithdrawal(withdrawalId: string, adminId: string, adminNote?: string): Promise<ReviewWithdrawalResult> {
    return withTransaction(async (session) => {
      const updated = await Withdrawal.findOneAndUpdate(
        { _id: new Types.ObjectId(withdrawalId), status: WithdrawalStatus.PENDING },
        {
          $set: {
            status: WithdrawalStatus.REJECTED,
            reviewedBy: new Types.ObjectId(adminId),
            reviewedAt: new Date(),
            adminNote: adminNote || undefined,
          },
        },
        { new: true, session }
      );

      if (!updated) throw new AppError('Withdrawal was already reviewed or does not exist.', 409);

      const user = await User.findOneAndUpdate(
        { _id: updated.userId, isActive: true },
        { $inc: { walletBalance: updated.amount, withdrawableBalance: updated.amount } },
        { new: true, session }
      );
      if (!user) throw new AppError('User not found or inactive.', 404);

      if (updated.walletTransactionId) {
        await Transaction.findOneAndUpdate(
          { referenceId: updated.walletTransactionId },
          { $set: { status: TransactionStatus.REVERSED } },
          { session }
        );
      }

      const refundRef = `WITHDRAWAL:REFUND:${updated._id.toString()}`;
      await Transaction.create(
        [{
          userId: user._id,
          type: TransactionType.REFUND,
          status: TransactionStatus.SUCCESS,
          amount: updated.amount,
          balanceBefore: user.walletBalance - updated.amount,
          balanceAfter: user.walletBalance,
          referenceId: refundRef,
          metadata: { withdrawalId: updated._id.toString(), reason: 'WITHDRAWAL_REJECTED' },
        }],
        { session }
      );

      return {
        withdrawal: toWithdrawalPublic(updated),
        walletBalance: user.walletBalance,
        walletTransactionId: updated.walletTransactionId,
      };
    });
  }
}

export default new WithdrawalService();
