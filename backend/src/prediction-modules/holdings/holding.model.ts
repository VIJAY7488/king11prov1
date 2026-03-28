import { Document, Model, Schema, Types, model } from 'mongoose';
import { TradeOutcome } from '../trades/trade.types';

export interface IHolding extends Document {
  userId: Types.ObjectId;
  marketId: Types.ObjectId;
  outcome: TradeOutcome;
  quantity: number;
  avgPrice: number;
  investedAmount: number;
  realizedPnL: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IHoldingModel extends Model<IHolding> {}

const holdingSchema = new Schema<IHolding, IHoldingModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    marketId: {
      type: Schema.Types.ObjectId,
      ref: 'Market',
      required: [true, 'marketId is required'],
      index: true,
    },
    outcome: {
      type: String,
      enum: {
        values: Object.values(TradeOutcome),
        message: `outcome must be one of: ${Object.values(TradeOutcome).join(', ')}`,
      },
      required: [true, 'outcome is required'],
      index: true,
    },
    quantity: {
      type: Number,
      required: [true, 'quantity is required'],
      default: 0,
      min: [0, 'quantity cannot be negative'],
    },
    avgPrice: {
      type: Number,
      required: [true, 'avgPrice is required'],
      default: 0,
      min: [0, 'avgPrice cannot be negative'],
      max: [1, 'avgPrice cannot be above 1'],
    },
    investedAmount: {
      type: Number,
      required: [true, 'investedAmount is required'],
      default: 0,
      min: [0, 'investedAmount cannot be negative'],
    },
    realizedPnL: {
      type: Number,
      required: [true, 'realizedPnL is required'],
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

holdingSchema.index({ userId: 1, marketId: 1 }, { unique: false });
holdingSchema.index({ userId: 1, marketId: 1, outcome: 1 }, { unique: true });
holdingSchema.index({ marketId: 1, outcome: 1, updatedAt: -1 });

holdingSchema.pre('validate', function (this: IHolding) {
  if (this.quantity === 0) {
    this.avgPrice = 0;
    this.investedAmount = 0;
    return;
  }

  const expectedInvested = Number((this.quantity * this.avgPrice).toFixed(8));
  const stored = Number(this.investedAmount.toFixed(8));
  if (expectedInvested !== stored) {
    this.investedAmount = expectedInvested;
  }
});

export const Holding = model<IHolding, IHoldingModel>('Holding', holdingSchema);
