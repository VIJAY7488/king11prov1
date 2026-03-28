import { Document, Model, Schema, Types, model } from 'mongoose';
import { IAmmSideLimits, IRiskAlert, ISideLimit, RiskAlertType } from './risk.types';



export interface IRiskControl extends Document {
  marketId: Types.ObjectId;
  maxExposure: number;
  currentExposure: number;
  exposureUtilization: number;
  yesExposure: number;
  noExposure: number;
  netExposure: number;
  imbalanceRatio: number;
  ammEnabled: boolean;
  orderBookEnabled: boolean;
  marketFrozen: boolean;
  circuitBreakerUntil: Date | null;
  maxOrderSizePerUser: number;
  maxPositionPerUser: number;
  dynamicSpreadBps: number;
  bMultiplier: number;
  baseB: number;
  adjustedB: number;
  ammSideLimits: IAmmSideLimits;
  alerts: IRiskAlert[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IRiskControlModel extends Model<IRiskControl> {}

const sideLimitSchema = new Schema<ISideLimit>(
  {
    maxSingleTrade: {
      type: Number,
      required: [true, 'maxSingleTrade is required'],
      min: [0, 'maxSingleTrade cannot be negative'],
      default: 5000,
    },
    enabled: {
      type: Boolean,
      required: [true, 'enabled is required'],
      default: true,
    },
  },
  { _id: false }
);

const alertSchema = new Schema<IRiskAlert>(
  {
    type: {
      type: String,
      enum: {
        values: Object.values(RiskAlertType),
        message: `Alert type must be one of: ${Object.values(RiskAlertType).join(', ')}`,
      },
      required: [true, 'alert type is required'],
    },
    triggeredAt: {
      type: Date,
      required: [true, 'triggeredAt is required'],
      default: Date.now,
    },
    threshold: {
      type: Number,
      required: [true, 'threshold is required'],
    },
    value: {
      type: Number,
      required: [true, 'value is required'],
    },
    resolved: {
      type: Boolean,
      required: [true, 'resolved is required'],
      default: false,
    },
  },
  { _id: false }
);

const riskControlSchema = new Schema<IRiskControl, IRiskControlModel>(
  {
    marketId: {
      type: Schema.Types.ObjectId,
      ref: 'Market',
      required: [true, 'marketId is required'],
      unique: true,
      index: true,
    },
    maxExposure: {
      type: Number,
      required: [true, 'maxExposure is required'],
      default: 500000,
      min: [0, 'maxExposure cannot be negative'],
    },
    currentExposure: {
      type: Number,
      required: [true, 'currentExposure is required'],
      default: 0,
      min: [0, 'currentExposure cannot be negative'],
    },
    exposureUtilization: {
      type: Number,
      required: [true, 'exposureUtilization is required'],
      default: 0,
      min: [0, 'exposureUtilization cannot be negative'],
    },
    yesExposure: {
      type: Number,
      required: [true, 'yesExposure is required'],
      default: 0,
      min: [0, 'yesExposure cannot be negative'],
    },
    noExposure: {
      type: Number,
      required: [true, 'noExposure is required'],
      default: 0,
      min: [0, 'noExposure cannot be negative'],
    },
    netExposure: {
      type: Number,
      required: [true, 'netExposure is required'],
      default: 0,
    },
    imbalanceRatio: {
      type: Number,
      required: [true, 'imbalanceRatio is required'],
      default: 1,
      min: [0, 'imbalanceRatio cannot be negative'],
    },
    ammEnabled: {
      type: Boolean,
      required: [true, 'ammEnabled is required'],
      default: true,
    },
    orderBookEnabled: {
      type: Boolean,
      required: [true, 'orderBookEnabled is required'],
      default: true,
    },
    marketFrozen: {
      type: Boolean,
      required: [true, 'marketFrozen is required'],
      default: false,
    },
    circuitBreakerUntil: {
      type: Date,
      default: null,
    },
    maxOrderSizePerUser: {
      type: Number,
      required: [true, 'maxOrderSizePerUser is required'],
      default: 5000,
      min: [1, 'maxOrderSizePerUser must be at least 1'],
    },
    maxPositionPerUser: {
      type: Number,
      required: [true, 'maxPositionPerUser is required'],
      default: 25000,
      min: [1, 'maxPositionPerUser must be at least 1'],
    },
    dynamicSpreadBps: {
      type: Number,
      required: [true, 'dynamicSpreadBps is required'],
      default: 0,
      min: [0, 'dynamicSpreadBps cannot be negative'],
    },
    bMultiplier: {
      type: Number,
      required: [true, 'bMultiplier is required'],
      default: 1,
      min: [0.01, 'bMultiplier must be greater than 0'],
    },
    baseB: {
      type: Number,
      required: [true, 'baseB is required'],
      default: 100,
      min: [0.01, 'baseB must be greater than 0'],
    },
    adjustedB: {
      type: Number,
      required: [true, 'adjustedB is required'],
      default: 100,
      min: [0.01, 'adjustedB must be greater than 0'],
    },
    ammSideLimits: {
      type: {
        YES: {
          type: sideLimitSchema,
          required: [true, 'YES side limit is required'],
          default: { maxSingleTrade: 5000, enabled: true },
        },
        NO: {
          type: sideLimitSchema,
          required: [true, 'NO side limit is required'],
          default: { maxSingleTrade: 5000, enabled: true },
        },
      },
      required: [true, 'ammSideLimits is required'],
      default: {
        YES: { maxSingleTrade: 5000, enabled: true },
        NO: { maxSingleTrade: 5000, enabled: true },
      },
    },
    alerts: {
      type: [alertSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

riskControlSchema.index({ marketId: 1, updatedAt: -1 });
riskControlSchema.index({ currentExposure: -1, updatedAt: -1 });
riskControlSchema.index({ imbalanceRatio: -1, updatedAt: -1 });
riskControlSchema.index({ 'alerts.resolved': 1, updatedAt: -1 });
riskControlSchema.index({ marketFrozen: 1, updatedAt: -1 });
riskControlSchema.index({ circuitBreakerUntil: 1 });

riskControlSchema.pre('validate', function (this: IRiskControl) {
  const maxExposure = this.maxExposure;
  const currentExposure = this.currentExposure;
  const yesExposure = this.yesExposure;
  const noExposure = this.noExposure;

  const utilization = maxExposure > 0 ? currentExposure / maxExposure : 0;
  this.exposureUtilization = Number(utilization.toFixed(8));
  this.netExposure = Number((yesExposure - noExposure).toFixed(8));

  const imbalance = noExposure > 0 ? yesExposure / noExposure : (yesExposure > 0 ? Number.MAX_SAFE_INTEGER : 1);
  this.imbalanceRatio = Number(imbalance.toFixed(8));
});

export const RiskControl = model<IRiskControl, IRiskControlModel>('RiskControl', riskControlSchema);
