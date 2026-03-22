import { Document, Model, Schema, Types, model } from 'mongoose';
import { ReferralRewardStatus } from './referral.types';

export const REFERRAL_REWARD_AMOUNT = 50;

export interface IReferral extends Document {
  referrerUserId: Types.ObjectId;
  referredUserId: Types.ObjectId;
  referralCodeUsed: string;
  rewardAmount: number;
  rewardStatus: ReferralRewardStatus;
  referredFirstDepositId?: Types.ObjectId;
  referredFirstDepositAt?: Date;
  rewardTxnReferenceId?: string;
  rewardedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReferralModel extends Model<IReferral> {}

const referralSchema = new Schema<IReferral, IReferralModel>(
  {
    referrerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    referredUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    referralCodeUsed: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 6,
      maxlength: 20,
    },
    rewardAmount: {
      type: Number,
      default: REFERRAL_REWARD_AMOUNT,
      min: 1,
    },
    rewardStatus: {
      type: String,
      enum: Object.values(ReferralRewardStatus),
      default: ReferralRewardStatus.PENDING,
      index: true,
    },
    referredFirstDepositId: {
      type: Schema.Types.ObjectId,
      ref: 'Deposit',
      default: undefined,
    },
    referredFirstDepositAt: {
      type: Date,
      default: undefined,
    },
    rewardTxnReferenceId: {
      type: String,
      default: undefined,
      sparse: true,
    },
    rewardedAt: {
      type: Date,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
  }
);

referralSchema.index({ referrerUserId: 1, createdAt: -1 });
referralSchema.index({ referredUserId: 1 }, { unique: true });
referralSchema.index({ rewardStatus: 1, createdAt: -1 });

const Referral = model<IReferral, IReferralModel>('Referral', referralSchema);

export default Referral;
