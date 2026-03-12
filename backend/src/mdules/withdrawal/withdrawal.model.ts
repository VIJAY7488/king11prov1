import { Document, Model, Schema, Types, model } from 'mongoose';
import { WithdrawalMethod, WithdrawalStatus } from './withdrawal.types';

export interface IWithdrawal extends Document {
  userId: Types.ObjectId;
  amount: number;
  method: WithdrawalMethod;
  upiId?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  note?: string;
  status: WithdrawalStatus;
  adminNote?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  walletTransactionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWithdrawalModel extends Model<IWithdrawal> {}

const withdrawalSchema = new Schema<IWithdrawal, IWithdrawalModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    method: {
      type: String,
      enum: Object.values(WithdrawalMethod),
      required: true,
    },
    upiId: {
      type: String,
      trim: true,
      default: undefined,
    },
    accountHolderName: {
      type: String,
      trim: true,
      default: undefined,
    },
    accountNumber: {
      type: String,
      trim: true,
      default: undefined,
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: undefined,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
      default: undefined,
    },
    status: {
      type: String,
      enum: Object.values(WithdrawalStatus),
      default: WithdrawalStatus.PENDING,
      index: true,
    },
    adminNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: undefined,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    },
    reviewedAt: {
      type: Date,
      default: undefined,
    },
    walletTransactionId: {
      type: String,
      sparse: true,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
  }
);

withdrawalSchema.index({ userId: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });
withdrawalSchema.index({ method: 1, status: 1 });

export const Withdrawal = model<IWithdrawal, IWithdrawalModel>('Withdrawal', withdrawalSchema);
