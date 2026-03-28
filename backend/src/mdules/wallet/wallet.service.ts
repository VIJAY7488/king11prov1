import mongoose, { Types } from "mongoose"
import Transaction from "./wallet.model"
import { CreditDepositBonusDTO, CreditFromDepositDTO, PaginatedTransactions, TransactionQueryParams, TransactionRecord, TransactionStatus, TransactionType, WalletBalanceSummary, WalletMutationDTO, WalletOperationResult, WalletTransferLockedToDebitDTO, WalletTxnReason } from "./wallet.types"
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
    reason: doc.reason,
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
    private ensureWalletInvariant(
      walletBalance: number,
      withdrawableBalance: number,
      nonWithdrawableBonusBalance: number,
      lockedBalance: number
    ): void {
      if (walletBalance < 0 || withdrawableBalance < 0 || nonWithdrawableBonusBalance < 0 || lockedBalance < 0) {
        throw new AppError('Wallet invariant violated: balances cannot be negative.', 500);
      }
      if (lockedBalance > walletBalance) {
        throw new AppError('Wallet invariant violated: lockedBalance cannot exceed total balance.', 500);
      }
    }

    private async appendLedgerEntry(
      userId: Types.ObjectId,
      type: TransactionType,
      amount: number,
      balanceBefore: number,
      balanceAfter: number,
      referenceId: string,
      reason: WalletTxnReason,
      metadata: Record<string, unknown> | undefined,
      session?: ClientSession
    ): Promise<TransactionRecord> {
      const [txn] = await Transaction.create(
        [
          {
            userId,
            type,
            status: TransactionStatus.SUCCESS,
            amount,
            balanceBefore,
            balanceAfter,
            referenceId,
            reason,
            metadata,
          }
        ],
        session ? { session } : undefined
      );

      return toTransactionRecord(txn);
    }

    async getWallet(userId: string, session?: ClientSession): Promise<WalletBalanceSummary> {
      const query = User.findById(userId).select('walletBalance lockedBalance withdrawableBalance nonWithdrawableBonusBalance');
      if (session) query.session(session);
      const user = await query;
      if (!user) throw new AppError('User not found.', 404);

      return {
        totalBalance: user.walletBalance,
        lockedBalance: user.lockedBalance,
        availableBalance: Math.max(0, user.walletBalance - user.lockedBalance),
        withdrawableBalance: user.withdrawableBalance,
        nonWithdrawableBonusBalance: user.nonWithdrawableBonusBalance,
      };
    }

    async checkBalance(userId: string, amount: number, session?: ClientSession): Promise<boolean> {
      if (!Number.isFinite(amount) || amount <= 0) throw new AppError('amount must be greater than 0.', 400);
      const wallet = await this.getWallet(userId, session);
      return wallet.availableBalance >= amount;
    }

    async debitBalance(userId: string, dto: WalletMutationDTO, session?: ClientSession): Promise<WalletOperationResult> {
      if (!Number.isFinite(dto.amount) || dto.amount <= 0) throw new AppError('amount must be greater than 0.', 400);
      const execute = async (txnSession: ClientSession): Promise<WalletOperationResult> => {
        const user = await User.findById(userId).session(txnSession);
        if (!user) throw new AppError('User not found.', 404);
        if (!user.isActive) throw new AppError('Account is deactivated.', 403);

        const available = user.walletBalance - user.lockedBalance;
        if (available < dto.amount) throw new AppError('Insufficient available wallet balance.', 402);

        const bonusUsed = Math.min(user.nonWithdrawableBonusBalance, dto.amount);
        const withdrawableUsed = dto.amount - bonusUsed;

        const balanceBefore = user.walletBalance;
        user.walletBalance = Number((user.walletBalance - dto.amount).toFixed(8));
        user.withdrawableBalance = Number((user.withdrawableBalance - withdrawableUsed).toFixed(8));
        user.nonWithdrawableBonusBalance = Number((user.nonWithdrawableBonusBalance - bonusUsed).toFixed(8));
        this.ensureWalletInvariant(
          user.walletBalance,
          user.withdrawableBalance,
          user.nonWithdrawableBonusBalance,
          user.lockedBalance
        );
        await user.save({ session: txnSession });

        const transaction = await this.appendLedgerEntry(
          user._id,
          TransactionType.DEBIT,
          dto.amount,
          balanceBefore,
          user.walletBalance,
          dto.referenceId,
          dto.reason,
          { ...(dto.metadata ?? {}), bonusUsed, withdrawableUsed },
          txnSession
        );
        return { transaction, currentBalance: user.walletBalance };
      };

      if (session) return execute(session);
      return withTransaction(execute);
    }

    async creditBalance(userId: string, dto: WalletMutationDTO, session?: ClientSession): Promise<WalletOperationResult> {
      if (!Number.isFinite(dto.amount) || dto.amount <= 0) throw new AppError('amount must be greater than 0.', 400);
      const execute = async (txnSession: ClientSession): Promise<WalletOperationResult> => {
        const user = await User.findById(userId).session(txnSession);
        if (!user) throw new AppError('User not found.', 404);
        if (!user.isActive) throw new AppError('Account is deactivated.', 403);

        const balanceBefore = user.walletBalance;
        user.walletBalance = Number((user.walletBalance + dto.amount).toFixed(8));
        user.withdrawableBalance = Number((user.withdrawableBalance + dto.amount).toFixed(8));
        this.ensureWalletInvariant(
          user.walletBalance,
          user.withdrawableBalance,
          user.nonWithdrawableBonusBalance,
          user.lockedBalance
        );
        await user.save({ session: txnSession });

        const transaction = await this.appendLedgerEntry(
          user._id,
          TransactionType.CREDIT,
          dto.amount,
          balanceBefore,
          user.walletBalance,
          dto.referenceId,
          dto.reason,
          dto.metadata,
          txnSession
        );
        return { transaction, currentBalance: user.walletBalance };
      };

      if (session) return execute(session);
      return withTransaction(execute);
    }

    async lockBalance(userId: string, dto: WalletMutationDTO, session?: ClientSession): Promise<WalletOperationResult> {
      if (!Number.isFinite(dto.amount) || dto.amount <= 0) throw new AppError('amount must be greater than 0.', 400);
      const execute = async (txnSession: ClientSession): Promise<WalletOperationResult> => {
        const user = await User.findById(userId).session(txnSession);
        if (!user) throw new AppError('User not found.', 404);
        if (!user.isActive) throw new AppError('Account is deactivated.', 403);

        const available = user.walletBalance - user.lockedBalance;
        if (available < dto.amount) throw new AppError('Insufficient available balance to lock funds.', 402);

        const balanceBefore = user.walletBalance;
        user.lockedBalance = Number((user.lockedBalance + dto.amount).toFixed(8));
        this.ensureWalletInvariant(
          user.walletBalance,
          user.withdrawableBalance,
          user.nonWithdrawableBonusBalance,
          user.lockedBalance
        );
        await user.save({ session: txnSession });

        const transaction = await this.appendLedgerEntry(
          user._id,
          TransactionType.LOCK,
          dto.amount,
          balanceBefore,
          user.walletBalance,
          dto.referenceId,
          dto.reason,
          { ...(dto.metadata ?? {}), lockedBalanceAfter: user.lockedBalance },
          txnSession
        );
        return { transaction, currentBalance: user.walletBalance };
      };

      if (session) return execute(session);
      return withTransaction(execute);
    }

    async unlockBalance(userId: string, dto: WalletMutationDTO, session?: ClientSession): Promise<WalletOperationResult> {
      if (!Number.isFinite(dto.amount) || dto.amount <= 0) throw new AppError('amount must be greater than 0.', 400);
      const execute = async (txnSession: ClientSession): Promise<WalletOperationResult> => {
        const user = await User.findById(userId).session(txnSession);
        if (!user) throw new AppError('User not found.', 404);
        if (!user.isActive) throw new AppError('Account is deactivated.', 403);
        if (user.lockedBalance < dto.amount) throw new AppError('Insufficient locked balance to unlock.', 409);

        const balanceBefore = user.walletBalance;
        user.lockedBalance = Number((user.lockedBalance - dto.amount).toFixed(8));
        this.ensureWalletInvariant(
          user.walletBalance,
          user.withdrawableBalance,
          user.nonWithdrawableBonusBalance,
          user.lockedBalance
        );
        await user.save({ session: txnSession });

        const transaction = await this.appendLedgerEntry(
          user._id,
          TransactionType.UNLOCK,
          dto.amount,
          balanceBefore,
          user.walletBalance,
          dto.referenceId,
          dto.reason,
          { ...(dto.metadata ?? {}), lockedBalanceAfter: user.lockedBalance },
          txnSession
        );
        return { transaction, currentBalance: user.walletBalance };
      };

      if (session) return execute(session);
      return withTransaction(execute);
    }

    async transferLockedToDebit(
      userId: string,
      dto: WalletTransferLockedToDebitDTO,
      session?: ClientSession
    ): Promise<WalletOperationResult> {
      if (!Number.isFinite(dto.amount) || dto.amount <= 0) throw new AppError('amount must be greater than 0.', 400);
      const execute = async (txnSession: ClientSession): Promise<WalletOperationResult> => {
        const user = await User.findById(userId).session(txnSession);
        if (!user) throw new AppError('User not found.', 404);
        if (!user.isActive) throw new AppError('Account is deactivated.', 403);
        if (user.lockedBalance < dto.amount) throw new AppError('Insufficient locked balance for settlement.', 409);

        const balanceBefore = user.walletBalance;
        const bonusUsed = Math.min(user.nonWithdrawableBonusBalance, dto.amount);
        const withdrawableUsed = dto.amount - bonusUsed;

        user.lockedBalance = Number((user.lockedBalance - dto.amount).toFixed(8));
        user.walletBalance = Number((user.walletBalance - dto.amount).toFixed(8));
        user.withdrawableBalance = Number((user.withdrawableBalance - withdrawableUsed).toFixed(8));
        user.nonWithdrawableBonusBalance = Number((user.nonWithdrawableBonusBalance - bonusUsed).toFixed(8));
        this.ensureWalletInvariant(
          user.walletBalance,
          user.withdrawableBalance,
          user.nonWithdrawableBonusBalance,
          user.lockedBalance
        );
        await user.save({ session: txnSession });

        const transaction = await this.appendLedgerEntry(
          user._id,
          TransactionType.DEBIT,
          dto.amount,
          balanceBefore,
          user.walletBalance,
          dto.referenceId,
          dto.reason ?? WalletTxnReason.ORDER_EXECUTION,
          { ...(dto.metadata ?? {}), fromLockedBalance: true, bonusUsed, withdrawableUsed },
          txnSession
        );
        return { transaction, currentBalance: user.walletBalance };
      };

      if (session) return execute(session);
      return withTransaction(execute);
    }

    async creditSettlement(
      userId: string,
      amount: number,
      referenceId: string,
      metadata?: Record<string, unknown>,
      session?: ClientSession
    ): Promise<WalletOperationResult> {
      return this.creditBalance(
        userId,
        {
          amount,
          referenceId,
          reason: WalletTxnReason.SETTLEMENT,
          metadata,
        },
        session
      );
    }

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
                { $inc: { walletBalance: dto.amount, withdrawableBalance: dto.amount } },
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

    async creditDepositBonus(userId: string, dto: CreditDepositBonusDTO, session: ClientSession):
        Promise<WalletOperationResult> {
            const walletTxnRef = `DEPOSIT:BONUS:${dto.depositId}`;

            const existing = await Transaction.findOne({ referenceId: walletTxnRef }).session(session);
            if (existing) {
                return { transaction: toTransactionRecord(existing), currentBalance: existing.balanceAfter };
            }

            const updatedUser = await User.findOneAndUpdate(
                { _id: new Types.ObjectId(userId), isActive: true },
                { $inc: { walletBalance: dto.bonusAmount, nonWithdrawableBonusBalance: dto.bonusAmount } },
                { new: true, session }
            );

            if (!updatedUser) {
                const exists = await User.exists({ _id: userId }).session(session);
                if (!exists) throw new AppError('User not found.', 404);
                throw new AppError('Account is deactivated.', 403);
            }

            const balanceAfter = updatedUser.walletBalance;
            const balanceBefore = balanceAfter - dto.bonusAmount;

            const [txn] = await Transaction.create(
                [
                    {
                        userId: updatedUser._id,
                        type: TransactionType.DEPOSIT_BONUS,
                        status: TransactionStatus.SUCCESS,
                        amount: dto.bonusAmount,
                        balanceBefore,
                        balanceAfter,
                        referenceId: walletTxnRef,
                        metadata: {
                            depositId: dto.depositId,
                            refNumber: dto.refNumber,
                            approvedBy: dto.approvedBy,
                            bonusPercent: dto.bonusPercent,
                            nonWithdrawable: true,
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

        // Check total usable balance first (withdrawable + bonus)
        const user = await User.findById(userId).session(session);
        if (!user) throw new AppError('User not found.', 404);
        if (user.walletBalance < amount) {
            throw new AppError('Insufficient wallet balance. Please add funds and try again.', 402);
        }

        const bonusUsed = Math.min(user.nonWithdrawableBonusBalance, amount);
        const withdrawableUsed = amount - bonusUsed;

        // Deduct balance
        const updatedUser = await User.findOneAndUpdate(
            {
                _id: new Types.ObjectId(userId),
                isActive: true,
                walletBalance: { $gte: amount },
                withdrawableBalance: { $gte: withdrawableUsed },
                nonWithdrawableBonusBalance: { $gte: bonusUsed },
            },
            {
                $inc: {
                    walletBalance: -amount,
                    withdrawableBalance: -withdrawableUsed,
                    nonWithdrawableBonusBalance: -bonusUsed,
                }
            },
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
                    metadata: { contestId, teamId, bonusUsed, withdrawableUsed }
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
            { $inc: { walletBalance: amount, withdrawableBalance: amount } },
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
        teamId: string,
        amount: number,
        session: ClientSession
    ): Promise<WalletOperationResult | null> {
        if (!Number.isFinite(amount) || amount <= 0) return null;

        const walletTxnRef = `REFUND:CANCELLED:${contestId}:${contestEntryId}`;
        const existing = await Transaction.findOne({ referenceId: walletTxnRef }).session(session);
        if (existing) {
            return { transaction: toTransactionRecord(existing), currentBalance: existing.balanceAfter };
        }

        const joinTxnRef = `JOIN:${contestId}:${teamId}:${userId}`;
        const joinTxn = await Transaction.findOne({ referenceId: joinTxnRef }).session(session);
        const joinMeta = (joinTxn?.metadata ?? {}) as Record<string, unknown>;
        const bonusUsed = Number(joinMeta.bonusUsed ?? 0);
        const withdrawableUsed = Number(joinMeta.withdrawableUsed ?? amount);
        const safeBonusRefund = Math.max(0, Math.min(amount, bonusUsed));
        const safeWithdrawableRefund = Math.max(0, Math.min(amount - safeBonusRefund, withdrawableUsed));

        const updatedUser = await User.findOneAndUpdate(
            { _id: new Types.ObjectId(userId), isActive: true },
            {
                $inc: {
                    walletBalance: amount,
                    withdrawableBalance: safeWithdrawableRefund,
                    nonWithdrawableBonusBalance: safeBonusRefund,
                }
            },
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
                        teamId,
                        refundBreakup: {
                            bonus: safeBonusRefund,
                            withdrawable: safeWithdrawableRefund,
                        },
                    },
                }
            ],
            { session }
        );

        return { transaction: toTransactionRecord(txn), currentBalance: balanceAfter };
    }

    // ── Read Operations ────────────────────────────────────────────────────────

    async getBalance(userId: string): Promise<WalletBalanceSummary> {
        const user = await User.findById(userId).select('walletBalance lockedBalance withdrawableBalance nonWithdrawableBonusBalance');
        if (!user) throw new AppError('User not found.', 404);
        return {
            totalBalance: user.walletBalance,
            lockedBalance: user.lockedBalance,
            availableBalance: Math.max(0, user.walletBalance - user.lockedBalance),
            withdrawableBalance: user.withdrawableBalance,
            nonWithdrawableBonusBalance: user.nonWithdrawableBonusBalance,
        };
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
