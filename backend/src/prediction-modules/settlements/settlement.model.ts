import { Document, Model, Schema, Types, model } from 'mongoose';
import { TradeOutcome } from '../trades/trade.types';
import { SettlementStatus } from './settlement.types';

export interface ISettlement extends Document {
  marketId: Types.ObjectId;
  outcome: TradeOutcome;
  status: SettlementStatus;
  resolvedBy: Types.ObjectId;
  startedAt: Date;
  completedAt: Date | null;
  totalParticipants: number;
  totalWinners: number;
  totalLosers: number;
  totalWinningShares: number;
  totalPayout: number;
  lastProcessedHoldingId: Types.ObjectId | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISettlementModel extends Model<ISettlement> {}

const settlementSchema = new Schema<ISettlement, ISettlementModel>(
  {
    marketId: {
      type: Schema.Types.ObjectId,
      ref: 'Market',
      required: [true, 'marketId is required'],
      unique: true,
      index: true,
    },
    outcome: {
      type: String,
      enum: {
        values: Object.values(TradeOutcome),
        message: `outcome must be one of: ${Object.values(TradeOutcome).join(', ')}`,
      },
      required: [true, 'outcome is required'],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(SettlementStatus),
        message: `status must be one of: ${Object.values(SettlementStatus).join(', ')}`,
      },
      required: [true, 'status is required'],
      default: SettlementStatus.PROCESSING,
      index: true,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'resolvedBy is required'],
      index: true,
    },
    startedAt: {
      type: Date,
      required: [true, 'startedAt is required'],
      default: Date.now,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    totalParticipants: {
      type: Number,
      required: [true, 'totalParticipants is required'],
      default: 0,
      min: [0, 'totalParticipants cannot be negative'],
    },
    totalWinners: {
      type: Number,
      required: [true, 'totalWinners is required'],
      default: 0,
      min: [0, 'totalWinners cannot be negative'],
    },
    totalLosers: {
      type: Number,
      required: [true, 'totalLosers is required'],
      default: 0,
      min: [0, 'totalLosers cannot be negative'],
    },
    totalWinningShares: {
      type: Number,
      required: [true, 'totalWinningShares is required'],
      default: 0,
      min: [0, 'totalWinningShares cannot be negative'],
    },
    totalPayout: {
      type: Number,
      required: [true, 'totalPayout is required'],
      default: 0,
      min: [0, 'totalPayout cannot be negative'],
    },
    lastProcessedHoldingId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    failureReason: {
      type: String,
      default: null,
      maxlength: [500, 'failureReason cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

settlementSchema.index({ status: 1, updatedAt: -1 });
settlementSchema.index({ resolvedBy: 1, createdAt: -1 });

export const Settlement = model<ISettlement, ISettlementModel>('Settlement', settlementSchema);
