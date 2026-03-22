import mongoose, { ClientSession, Types } from 'mongoose';
import Deposit, { IDeposit } from './deposit.model';
import { ApproveDepositResult, CreateDepositDTO, DepositPublic, DepositQueryParams, DepositStatus, PaginatedDeposits } from './deposite.types';
import AppError from '../../utils/AppError';
import User from '../user/users.model';
import walletService from '../wallet/wallet.service';
import referralService from '../referral/referral.service';

const DEPOSIT_BONUS_MIN_AMOUNT = 50;
const DEPOSIT_BONUS_PERCENT = 50;
const DEPOSIT_BONUS_CODE = 'KING11PRO50';
const round2 = (n: number): number => Math.round(n * 100) / 100;


// ── Shape Mapper ──────────────────────────────────────────────────────────────

const toDepositPublic = (doc: IDeposit): DepositPublic => ({
  id: (doc._id as Types.ObjectId).toString(),
  userId: doc.userId.toString(),
  amount: doc.amount,
  refNumber: doc.refNumber,
  bonusCode: doc.bonusCode,
  status: doc.status,
  reviewedAt: doc.reviewedAt,
  walletTransactionId: doc.walletTransactionId,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

// ── Transaction Utility ───────────────────────────────────────────────────────

const withTransaction = async <T>(
  fn: (session: ClientSession) => Promise<T>
): Promise<T> => {
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

// ── Service ───────────────────────────────────────────────────────────────────

export class DepositService {

  // ── User: Submit Deposit Request ───────────────────────────────────────────
  /**
   * User submits a deposit with their payment reference.
   * Status starts as PENDING — no wallet change yet.
   * Admin must approve before funds are credited.
   */
  async createDeposit(userId: string, dto: CreateDepositDTO): Promise<DepositPublic> {
    if (dto.amount <= 0) {
      throw new AppError('Deposit amount must be positive.', 400);
    }

    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found.', 404);
    if (!user.isActive) throw new AppError('Account is deactivated.', 403);

    // Prevent duplicate ref submissions (same user, same refNumber, not rejected)
    const isDuplicate = await Deposit.hasPendingDeposit(
      new Types.ObjectId(userId),
      dto.refNumber
    );
    if (isDuplicate) {
      throw new AppError(
        'A pending deposit with this reference number already exists.',
        409
      );
    }

    const deposit = await Deposit.create({
      userId: new Types.ObjectId(userId),
      amount: dto.amount,
      refNumber: dto.refNumber,
      bonusCode: dto.bonusCode?.trim().toUpperCase() || undefined,
      status: DepositStatus.PENDING,
    });

    return toDepositPublic(deposit);
  };


  // ── User: Get single deposit by ID ────────────────────────────────────────
  async getDepositById(depositId: string, userId: string): Promise<DepositPublic> {
    const deposit = await Deposit.findById(depositId);
    if (!deposit) throw new AppError('Deposit not found.', 404);

    // Ensure user can only fetch their own deposit
    if (deposit.userId.toString() !== userId) {
      throw new AppError('Not authorized to view this deposit.', 403);
    }

    return toDepositPublic(deposit);
  }


  // ── Admin: Approve Deposit ─────────────────────────────────────────────────
  /**
   * Single atomic session handles ALL writes:
   *   1. Deposit → status: APPROVED + walletTransactionId stamped
   *   2. User.walletBalance $inc via walletService.creditFromDeposit()
   *   3. Wallet Transaction ledger entry created inside same session
   *
   * walletService.creditFromDeposit() is passed the live session so both
   * the deposit update and the wallet credit commit or roll back together.
  */

  async approveDeposit (depositId: string, adminId: string): Promise<ApproveDepositResult> {
    const deposit = await Deposit.findById(depositId);
    if(!deposit) throw new AppError('Deposit request not found.', 404);
    
    if(deposit.status === DepositStatus.APPROVED) {
      throw new AppError('This deposit has already been approved.', 409);
    }

    if (deposit.status === DepositStatus.REJECTED) {
      throw new AppError(
        'This deposit was rejected and cannot be approved. Create a new deposit request.',
        409
      );
    }

    // deposit.status === PENDING — safe to proceed
    const walletTxnRef = `DEPOSIT:APPROVED:${depositId}`;

    return withTransaction(async (session) => {
      
      // Step 1: Flip deposit status to APPROVED and stamp the cross-link reference
      const updatedDeposit = await Deposit.findByIdAndUpdate(
        {
          _id: new Types.ObjectId(depositId),
          status: DepositStatus.PENDING,     // re-validate inside session (snapshot isolation)
        },

        {
          $set: {
            status: DepositStatus.APPROVED,
            reviewedBy: new Types.ObjectId(adminId),
            reviewedAt: new Date(),
            walletTransactionId: walletTxnRef,
          },
        },

        { new: true, session }
      );

      // Race guard: another admin approved between pre-flight and session start
      if (!updatedDeposit) {
        throw new AppError(
          'Deposit was already reviewed by another admin. Refresh and try again.',
          409
        );
      }

      // Step 2 + 3: Credit wallet balance + write wallet ledger entry.
      // walletService.creditFromDeposit() joins this session — if it throws,
      // the deposit status update above is rolled back automatically.
      const walletResult = await walletService.creditFromDeposit(
        deposit.userId.toString(),
        {
          amount: deposit.amount,
          depositId,
          refNumber: deposit.refNumber,
          approvedBy: adminId,
        },
        session  // ← passes the live session in — single atomic boundary
      );

      const isBonusCodeMatched = (deposit.bonusCode || '').toUpperCase() === DEPOSIT_BONUS_CODE;
      const bonusCredited = (deposit.amount >= DEPOSIT_BONUS_MIN_AMOUNT && isBonusCodeMatched)
        ? round2((deposit.amount * DEPOSIT_BONUS_PERCENT) / 100)
        : 0;
      let walletBonusTransactionId: string | undefined;

      if (bonusCredited > 0) {
        await walletService.creditDepositBonus(
          deposit.userId.toString(),
          {
            bonusAmount: bonusCredited,
            depositId,
            refNumber: deposit.refNumber,
            approvedBy: adminId,
            bonusPercent: DEPOSIT_BONUS_PERCENT,
          },
          session
        );
        walletBonusTransactionId = `DEPOSIT:BONUS:${depositId}`;
      }

      await referralService.rewardReferrerOnFirstApprovedDeposit(
        deposit.userId.toString(),
        depositId,
        session
      );

      return {
        deposit: toDepositPublic(updatedDeposit),
        walletBalance: walletResult.currentBalance + bonusCredited,
        walletTransactionId: walletTxnRef,
        bonusCredited,
        walletBonusTransactionId,
      };
    });
  };


  // ── Admin: Reject Deposit ──────────────────────────────────────────────────
  async rejectDeposit(depositId: string, adminId: string, _adminNote?: string): Promise<DepositPublic> {
    const deposit = await Deposit.findById(depositId);
    if (!deposit) throw new AppError('Deposit request not found.', 404);
    if (deposit.status === DepositStatus.APPROVED) throw new AppError('Cannot reject an already approved deposit.', 409);
    if (deposit.status === DepositStatus.REJECTED) throw new AppError('Deposit is already rejected.', 409);

    const updated = await Deposit.findByIdAndUpdate(
      depositId,
      { $set: { status: DepositStatus.REJECTED, reviewedBy: new Types.ObjectId(adminId), reviewedAt: new Date() } },
      { new: true }
    );
    return toDepositPublic(updated!);
  }




  // ── Admin: List All Deposits ───────────────────────────────────────────────
  /**
   * Returns all deposits sorted newest → oldest.
   * Optionally filter by status (PENDING / APPROVED / REJECTED).
   * The userId field is populated with user name + mobile for display.
   */
  async listDeposits(params: DepositQueryParams): Promise<PaginatedDeposits> {
    const { status, page = 1, limit = 50 } = params;
    const filter: Record<string, unknown> = {};
    if (status) filter['status'] = status;

    const [deposits, total] = await Promise.all([
      Deposit.find(filter)
        .populate('userId', 'name mobileNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Deposit.countDocuments(filter),
    ]);

    return {
      deposits: deposits.map((d: any) => ({
        id: d._id.toString(),
        userId: d.userId?._id?.toString() ?? d.userId?.toString(),
        userName: d.userId?.name,
        userMobile: d.userId?.mobileNumber,
        amount: d.amount,
        refNumber: d.refNumber,
        bonusCode: d.bonusCode,
        status: d.status,
        reviewedAt: d.reviewedAt,
        walletTransactionId: d.walletTransactionId,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── User: My Deposits ──────────────────────────────────────────────────────
}

export default new DepositService();
