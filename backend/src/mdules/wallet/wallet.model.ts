import { Document, model, Model, Schema, Types } from "mongoose";
import { TransactionStatus, TransactionType } from "./wallet.types";





// ── Interface ─────────────────────────────────────────────────────────────────
export interface ITransaction extends Document {
    userId: Types.ObjectId;
    type: TransactionType;
    status: TransactionStatus;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    referenceId?: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
};


export interface ITransactionModel extends Model<ITransaction> {
    getBalanceSummary(userId: Types.ObjectId): Promise<{
        totalDeposited: number;
        totalDeducted: number;
        transactionCount: number;
    }>;
};


// ── Schema ────────────────────────────────────────────────────────────────────
const transactionSchema = new Schema<ITransaction, ITransactionModel> ({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required'],
        index: true,
    },

    type: {
        type: String,
        enum: Object.values(TransactionType),
        required: [true, 'Transaction type is required'],
    },

    status: {
        type: String,
        enum: Object.values(TransactionStatus),
        default: TransactionStatus.PENDING,
    },

    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        min: [0.01, 'Amount must be greater than 0'],
    },

    // Snapshot of balance before and after — critical for auditing
    balanceBefore: {
        type: Number,
        required: true,
        min: 0,
    },

    balanceAfter: {
        type: Number,
        required: true,
        min: 0,
    },

    // Idempotency key — e.g. payment gateway transaction ID
    referenceId: {
        type: String,
        trim: true,
        sparse: true,
    },

    // Flexible bag for context-specific data
    metadata: {
        type: Schema.Types.Mixed,
        default: undefined,
    },
}, {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
});


// ── Indexes ───────────────────────────────────────────────────────────────────
transactionSchema.index({ userId: 1, createdAt: -1 });          // user history feed
transactionSchema.index({ userId: 1, type: 1 });                // filter by type
transactionSchema.index({ userId: 1, status: 1 });              // filter by status
transactionSchema.index({ referenceId: 1 }, { sparse: true });  // idempotency lookups


// ── Static: getBalanceSummary ─────────────────────────────────────────────────
transactionSchema.statics.getBalanceSummary = async function (userId: Types.ObjectId):
  Promise<{ totalDeposited: number; totalDeducted: number; transactionCount: number }> {
    const CREDIT_TYPES = [TransactionType.DEPOSIT, TransactionType.REFUND, TransactionType.WIN_PRIZE];
    const DEBIT_TYPES  = [TransactionType.DEDUCTION, TransactionType.JOIN_CONTEST];

    const [result] = await this.aggregate([
        { $match: { userId, status: TransactionStatus.SUCCESS } },
        {
            $group: {
                _id: null,
                totalDeposited: {
                    $sum: { $cond: [{ $in: ['$type', CREDIT_TYPES] }, '$amount', 0] },
                },
                totalDeducted: {
                    $sum: { $cond: [{ $in: ['$type', DEBIT_TYPES] }, '$amount', 0] },
                },
                transactionCount: { $sum: 1 },
            }
        }
    ]);

    return result ?? { totalDeposited: 0, totalDeducted: 0, transactionCount: 0 };
};



// ── Model ─────────────────────────────────────────────────────────────────────
const Transaction = model<ITransaction, ITransactionModel>('Transaction', transactionSchema);

export default Transaction;
