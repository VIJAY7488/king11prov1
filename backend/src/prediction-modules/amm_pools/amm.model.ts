import { Document, Model, Schema, Types, model } from 'mongoose';

export interface IAmmPool extends Document {
  marketId: Types.ObjectId;
  b: number;
  q_yes: number;
  q_no: number;
  cost: number;
  priceYes: number;
  priceNo: number;
  totalExposure: number;
  totalVolume: number;
  totalTrades: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAmmPoolModel extends Model<IAmmPool> {}

const ammPoolSchema = new Schema<IAmmPool, IAmmPoolModel>(
  {
    marketId: {
      type: Schema.Types.ObjectId,
      ref: 'Market',
      required: [true, 'marketId is required'],
      unique: true,
      index: true,
    },
    b: {
      type: Number,
      required: [true, 'b is required'],
      default: 100,
      min: [0.000001, 'b must be greater than 0'],
    },
    q_yes: {
      type: Number,
      required: [true, 'q_yes is required'],
      default: 1000,
      min: [0, 'q_yes cannot be negative'],
    },
    q_no: {
      type: Number,
      required: [true, 'q_no is required'],
      default: 1000,
      min: [0, 'q_no cannot be negative'],
    },
    cost: {
      type: Number,
      required: [true, 'cost is required'],
      default: 0,
      min: [0, 'cost cannot be negative'],
    },
    priceYes: {
      type: Number,
      required: [true, 'priceYes is required'],
      default: 0.5,
      min: [0, 'priceYes cannot be below 0'],
      max: [1, 'priceYes cannot be above 1'],
    },
    priceNo: {
      type: Number,
      required: [true, 'priceNo is required'],
      default: 0.5,
      min: [0, 'priceNo cannot be below 0'],
      max: [1, 'priceNo cannot be above 1'],
    },
    totalExposure: {
      type: Number,
      required: [true, 'totalExposure is required'],
      default: 0,
      min: [0, 'totalExposure cannot be negative'],
    },
    totalVolume: {
      type: Number,
      required: [true, 'totalVolume is required'],
      default: 0,
      min: [0, 'totalVolume cannot be negative'],
    },
    totalTrades: {
      type: Number,
      required: [true, 'totalTrades is required'],
      default: 0,
      min: [0, 'totalTrades cannot be negative'],
    },
    version: {
      type: Number,
      required: [true, 'version is required'],
      default: 0,
      min: [0, 'version cannot be negative'],
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ammPoolSchema.index({ marketId: 1, version: 1 });
ammPoolSchema.index({ updatedAt: -1 });

ammPoolSchema.pre('validate', function (this: IAmmPool) {
  const b = this.b;
  const qYes = this.q_yes;
  const qNo = this.q_no;

  const expYes = Math.exp(qYes / b);
  const expNo = Math.exp(qNo / b);
  const denom = expYes + expNo;

  const priceYes = denom > 0 ? expYes / denom : 0.5;
  const priceNo = denom > 0 ? expNo / denom : 0.5;
  const cost = b * Math.log(denom);

  this.priceYes = Number(priceYes.toFixed(8));
  this.priceNo = Number(priceNo.toFixed(8));
  this.cost = Number(cost.toFixed(8));
});

export const AmmPool = model<IAmmPool, IAmmPoolModel>('AmmPool', ammPoolSchema);
