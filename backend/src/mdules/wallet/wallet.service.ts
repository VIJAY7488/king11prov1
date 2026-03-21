import mongoose, { Types } from "mongoose"
import Transaction from "./wallet.model"
import { CreditFromDepositDTO, PaginatedTransactions, TransactionQueryParams, TransactionRecord, TransactionStatus, TransactionType, WalletOperationResult } from "./wallet.types"
import { ClientSession } from "mongoose";
import User from "../user/users.model";
import AppError from "../../utils/AppError";




// ── Shape Mapper ──────────────────────────────────────────────────────────────

const toTransactionRecord = (doc: InstanceType<typeof Transaction>): TransactionRecord => ({
    id: (doc._id as Types.ObjectId).toString(),
    userId: doc.userId.toString(),
    type: doc.type,
    status: doc.status,
    amount: doc.amount,
    balanceBefore: doc.balanceBefore,
    balanceAfter: doc.balanceAfter,
    referenceId: doc.referenceId,
    metadata: doc.metadata,
    createdAt: doc.createdAt,
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

export class WalletService {
    // ── INTERNAL: Credit from Approved Deposit ────────────────────────────────
    /**
        * Called exclusively by deposit.service.approveDeposit() inside its own
        * MongoDB session. This method accepts an external session so the wallet
        * credit and the deposit status update commit atomically together.
        *
        * NOT exposed via any HTTP route — callers must go through the Deposit flow.
    */

    async creditFromDeposit(userId: string, dto: CreditFromDepositDTO, session: ClientSession): 
        Promise<WalletOperationResult> {
            const walletTxnRef = `DEPOSIT:APPROVED:${dto.depositId}`;

            // Idempotency guard — safe to call twice without double-crediting

            const existing = await Transaction.findOne({ referenceId: walletTxnRef }).session(session);
            if (existing) {
                return { transaction: toTransactionRecord(existing), currentBalance: existing.balanceAfter };
            }

            // Atomic credit: single $inc round-trip, returns updated doc
            const updatedUser = await User.findOneAndUpdate(
                { _id: new Types.ObjectId(userId), isActive: true },
                { $inc: { walletBalance: dto.amount } },
                { new: true, session }
            );

            if (!updatedUser) {
                const exists = await User.exists({ _id: userId }).session(session);
                if (!exists) throw new AppError('User not found.', 404);
                throw new AppError('Account is deactivated.', 403);
            }

            const balanceAfter  = updatedUser.walletBalance;
            const balanceBefore = balanceAfter - dto.amount;

            const [txn] = await Transaction.create(
                [
                    {
                        userId: updatedUser._id,
                        type: TransactionType.DEPOSIT,
                        status: TransactionStatus.SUCCESS,
                        amount: dto.amount,
                        balanceBefore,
                        balanceAfter,
                        referenceId: walletTxnRef,
                        metadata: {
                            depositId: dto.depositId,
                            refNumber: dto.refNumber,
                            approvedBy: dto.approvedBy,
                        }
                    }
                ], 
                { session }
            );

            return { transaction: toTransactionRecord(txn), currentBalance: balanceAfter };
    };

    // ── INTERNAL: Deduct for Contest Join ─────────────────────────────────────
    /**
     * Called exclusively by contest.service.joinContest() inside its own session.
     * Deducts entry fee and creates a JOIN_CONTEST transaction record.
     */
    async deductForContest(userId: string, contestId: string, teamId: string, amount: number, session: ClientSession): Promise<WalletOperationResult> {
        const walletTxnRef = `JOIN:${contestId}:${teamId}:${userId}`;

        // Idempotency: if transaction exists, it means the deduction already happened
        const existing = await Transaction.findOne({ referenceId: walletTxnRef }).session(session);
        if (existing) {
            return { transaction: toTransactionRecord(existing), currentBalance: existing.balanceAfter };
        }

        // Check balance first
        const user = await User.findById(userId).session(session);
        if (!user) throw new AppError('User not found.', 404);
        if (user.walletBalance < amount) {
            throw new AppError('Insufficient wallet balance. Please add funds and try again.', 402);
        }

        // Deduct balance
        const updatedUser = await User.findOneAndUpdate(
            { _id: new Types.ObjectId(userId), isActive: true, walletBalance: { $gte: amount } },
            { $inc: { walletBalance: -amount } },
            { new: true, session }
        );

        if (!updatedUser) {
            throw new AppError('Insufficient balance or account deactivated during transaction.', 402);
        }

        const balanceAfter = updatedUser.walletBalance;
        const balanceBefore = balanceAfter + amount;

        const [txn] = await Transaction.create(
            [
                {
                    userId: updatedUser._id,
                    type: TransactionType.JOIN_CONTEST,
                    status: TransactionStatus.SUCCESS,
                    amount: amount,
                    balanceBefore,
                    balanceAfter,
                    referenceId: walletTxnRef,
                    metadata: { contestId, teamId }
                }
            ],
            { session }
        );

        return { transaction: toTransactionRecord(txn), currentBalance: balanceAfter };
    }

    async creditContestWinnings(
        userId: string,
        contestId: string,
        teamId: string,
        amount: number,
        rank: number
    ): Promise<WalletOperationResult | null> {
        if (!Number.isFinite(amount) || amount <= 0) return null;

        const walletTxnRef = `WIN:${contestId}:${teamId}:${userId}`;

        const existing = await Transaction.findOne({ referenceId: walletTxnRef });
        if (existing) {
            return { transaction: toTransactionRecord(existing), currentBalance: existing.balanceAfter };
        }

        const updatedUser = await User.findOneAndUpdate(
            { _id: new Types.ObjectId(userId), isActive: true },
            { $inc: { walletBalance: amount } },
            { new: true }
        );

        if (!updatedUser) {
            const exists = await User.exists({ _id: userId });
            if (!exists) throw new AppError('User not found.', 404);
            throw new AppError('Account is deactivated.', 403);
        }

        const balanceAfter = updatedUser.walletBalance;
        const balanceBefore = balanceAfter - amount;

        const txn = await Transaction.create({
            userId: updatedUser._id,
            type: TransactionType.WIN_PRIZE,
            status: TransactionStatus.SUCCESS,
            amount,
            balanceBefore,
            balanceAfter,
            referenceId: walletTxnRef,
            metadata: { contestId, teamId, rank },
        });

        return { transaction: toTransactionRecord(txn), currentBalance: balanceAfter };
    }

    // ── INTERNAL: Refund for Contest Cancellation ────────────────────────────
    /**
     * Called by contest.service.updateContest() when status moves to CANCELLED.
     * Must run inside the caller's Mongo session so contest status + refunds
     * commit atomically.
     */
    async creditContestCancellationRefund(
        userId: string,
        contestId: string,
        contestEntryId: string,
        amount: number,
        session: ClientSession
    ): Promise<WalletOperationResult | null> {
        if (!Number.isFinite(amount) || amount <= 0) return null;

        const walletTxnRef = `REFUND:CANCELLED:${contestId}:${contestEntryId}`;
        const existing = await Transaction.findOne({ referenceId: walletTxnRef }).session(session);
        if (existing) {
            return { transaction: toTransactionRecord(existing), currentBalance: existing.balanceAfter };
        }

        const updatedUser = await User.findOneAndUpdate(
            { _id: new Types.ObjectId(userId), isActive: true },
            { $inc: { walletBalance: amount } },
            { new: true, session }
        );

        if (!updatedUser) {
            const exists = await User.exists({ _id: userId }).session(session);
            if (!exists) throw new AppError('User not found.', 404);
            throw new AppError('Account is deactivated.', 403);
        }

        const balanceAfter = updatedUser.walletBalance;
        const balanceBefore = balanceAfter - amount;

        const [txn] = await Transaction.create(
            [
                {
                    userId: updatedUser._id,
                    type: TransactionType.REFUND,
                    status: TransactionStatus.SUCCESS,
                    amount,
                    balanceBefore,
                    balanceAfter,
                    referenceId: walletTxnRef,
                    metadata: {
                        reason: 'CONTEST_CANCELLED',
                        contestId,
                        contestEntryId,
                    },
                }
            ],
            { session }
        );

        return { transaction: toTransactionRecord(txn), currentBalance: balanceAfter };
    }

    // ── Read Operations ────────────────────────────────────────────────────────

    async getBalance(userId: string): Promise<number> {
        const user = await User.findById(userId).select('walletBalance');
        if (!user) throw new AppError('User not found.', 404);
        return user.walletBalance;
    }

    async listTransactions(userId: string, params: TransactionQueryParams): Promise<PaginatedTransactions> {
        const page = Math.max(1, Number(params.page ?? 1));
        const limit = Math.min(100, Math.max(1, Number(params.limit ?? 20)));
        const skip = (page - 1) * limit;

        const filter: Record<string, unknown> = {
            userId: new Types.ObjectId(userId),
        };

        if (params.type) filter.type = params.type;
        if (params.status) filter.status = params.status;

        const createdAt: Record<string, Date> = {};
        if (params.startDate) {
            const d = new Date(params.startDate);
            if (!Number.isNaN(d.getTime())) createdAt.$gte = d;
        }
        if (params.endDate) {
            const d = new Date(params.endDate);
            if (!Number.isNaN(d.getTime())) createdAt.$lte = d;
        }
        if (Object.keys(createdAt).length > 0) filter.createdAt = createdAt;

        const [rows, total] = await Promise.all([
            Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Transaction.countDocuments(filter),
        ]);

        return {
            transactions: rows.map(toTransactionRecord),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
};

export default new WalletService();
