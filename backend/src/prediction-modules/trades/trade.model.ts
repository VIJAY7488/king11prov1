import { Document, Model, Schema, Types, model } from 'mongoose';
import { IAmmSnapshot, ITradeFees, TradeOutcome, TradeType } from './trade.types';



export interface ITrade extends Document {
  marketId: Types.ObjectId;
  outcome: TradeOutcome;
  tradeType: TradeType;
  buyOrderId: Types.ObjectId | null;
  sellOrderId: Types.ObjectId | null;
  buyerId: Types.ObjectId;
  sellerId: Types.ObjectId | null;
  price: number;
  quantity: number;
  totalValue: number;
  fees: ITradeFees;
  ammSnapshot: IAmmSnapshot | null;
  executedAt: Date;
  createdAt: Date;
}

export interface ITradeModel extends Model<ITrade> {}

const feesSchema = new Schema<ITradeFees>(
  {
    platform: {
      type: Number,
      required: [true, 'fees.platform is required'],
      min: [0, 'fees.platform cannot be negative'],
    },
    breakdown: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const ammSnapshotSchema = new Schema<IAmmSnapshot>(
  {
    q_yes_before: { type: Number, required: true, min: [0, 'q_yes_before cannot be negative'] },
    q_no_before: { type: Number, required: true, min: [0, 'q_no_before cannot be negative'] },
    q_yes_after: { type: Number, required: true, min: [0, 'q_yes_after cannot be negative'] },
    q_no_after: { type: Number, required: true, min: [0, 'q_no_after cannot be negative'] },
  },
  { _id: false }
);

const tradeSchema = new Schema<ITrade, ITradeModel>(
  {
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
    tradeType: {
      type: String,
      enum: {
        values: Object.values(TradeType),
        message: `tradeType must be one of: ${Object.values(TradeType).join(', ')}`,
      },
      required: [true, 'tradeType is required'],
      index: true,
    },
    buyOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },
    sellOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },
    buyerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'buyerId is required'],
      index: true,
    },
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    price: {
      type: Number,
      required: [true, 'price is required'],
      min: [0, 'price cannot be below 0'],
      max: [1, 'price cannot be above 1'],
    },
    quantity: {
      type: Number,
      required: [true, 'quantity is required'],
      min: [1, 'quantity must be at least 1'],
    },
    totalValue: {
      type: Number,
      required: [true, 'totalValue is required'],
      min: [0, 'totalValue cannot be negative'],
    },
    fees: {
      type: feesSchema,
      required: [true, 'fees is required'],
      default: {
        platform: 0,
        breakdown: {},
      },
    },
    ammSnapshot: {
      type: ammSnapshotSchema,
      default: null,
    },
    executedAt: {
      type: Date,
      required: [true, 'executedAt is required'],
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

tradeSchema.index({ marketId: 1, outcome: 1, executedAt: -1, _id: -1 });
tradeSchema.index({ buyerId: 1, executedAt: -1 });
tradeSchema.index({ sellerId: 1, executedAt: -1 });
tradeSchema.index({ buyOrderId: 1 });
tradeSchema.index({ sellOrderId: 1 });

tradeSchema.pre('validate', function (this: ITrade) {
  if (this.tradeType === TradeType.ORDER_BOOK) {
    if (!this.buyOrderId || !this.sellOrderId) {
      throw new Error('buyOrderId and sellOrderId are required for ORDER_BOOK trades');
    }
    if (!this.sellerId) {
      throw new Error('sellerId is required for ORDER_BOOK trades');
    }
    if (this.ammSnapshot) {
      throw new Error('ammSnapshot must be null for ORDER_BOOK trades');
    }
  }

  if (this.tradeType === TradeType.AMM) {
    if (this.buyOrderId || this.sellOrderId) {
      throw new Error('buyOrderId and sellOrderId must be null for AMM trades');
    }
    if (this.sellerId) {
      throw new Error('sellerId must be null for AMM trades');
    }
  }

  if (!Number.isFinite(this.totalValue) || this.totalValue < 0) {
    throw new Error('totalValue must be a non-negative finite number');
  }
});

export const Trade = model<ITrade, ITradeModel>('Trade', tradeSchema);
