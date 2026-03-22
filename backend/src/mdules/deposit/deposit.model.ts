
import { Document, Model, model, Schema, Types } from 'mongoose';
import { DepositStatus } from './deposite.types';


// ── Interface ────────────────────────────────────────────────────────────────
export interface IDeposit extends Document {
  userId: Types.ObjectId;
  amount: number;
  refNumber: string;          // UTR / payment gateway ref — stored as string
  bonusCode?: string;
  status: DepositStatus;             // user-supplied note      // rejection reason or approval comment
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  walletTransactionId?: string; // wallet ledger referenceId after approval
  createdAt: Date;
  updatedAt: Date;
}

export interface IDepositModel extends Model<IDeposit> {
  findPendingForUser(userId: Types.ObjectId): Promise<IDeposit[]>;
  hasPendingDeposit(userId: Types.ObjectId, refNumber: string): Promise<boolean>;
}


// ── Schema ────────────────────────────────────────────────────────────────────

const depositSchema = new Schema<IDeposit, IDepositModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Minimum deposit amount is 1'],
      // NOTE: trim is a string validator — removed from Number fields
    },

    // Stored as String — ref numbers can have leading zeros, letters (UTR, UPI IDs)
    refNumber: {
      type: String,
      required: [true, 'Reference number is required'],
      trim: true,
      maxlength: [100, 'Reference number cannot exceed 100 characters'],
    },

    bonusCode: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: [6, 'Bonus code must be at least 6 characters'],
      maxlength: [30, 'Bonus code cannot exceed 30 characters'],
      default: undefined,
    },

    status: {
      type: String,
      enum: Object.values(DepositStatus),
      default: DepositStatus.PENDING,
      index: true,
    },

    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },

    reviewedAt: {
      type: Date,
    },

    // Links to the wallet Transaction.referenceId after approval — full audit trail
    walletTransactionId: {
      type: String,
      sparse: true,
    },
  },
  {
    timestamps: true,   // auto createdAt / updatedAt
    versionKey: false,
    toJSON: { virtuals: true },
  }
);



// ── Indexes ───────────────────────────────────────────────────────────────────

depositSchema.index({ userId: 1, status: 1 });
depositSchema.index({ userId: 1, createdAt: -1 });
depositSchema.index({ status: 1, createdAt: -1 });           // admin review queue
depositSchema.index({ refNumber: 1, userId: 1 });            // duplicate ref check
depositSchema.index(
  { userId: 1, refNumber: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: DepositStatus.REJECTED } } }
  // Unique per user+refNumber unless rejected (allows resubmitting after rejection)
);



// ── Statics ───────────────────────────────────────────────────────────────────

depositSchema.statics.findPendingForUser = function (
  userId: Types.ObjectId
): Promise<IDeposit[]> {
  return this.find({ userId, status: DepositStatus.PENDING }).sort({ createdAt: -1 });
};

depositSchema.statics.hasPendingDeposit = async function (
  userId: Types.ObjectId,
  refNumber: string
): Promise<boolean> {
  const exists = await this.exists({ userId, refNumber, status: DepositStatus.PENDING });
  return !!exists;
};




// ── Model ─────────────────────────────────────────────────────────────────────

const Deposit = model<IDeposit, IDepositModel>('Deposit', depositSchema);
export default Deposit;


