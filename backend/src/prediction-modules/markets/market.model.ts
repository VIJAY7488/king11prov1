import { Document, Model, Schema, Types, model } from 'mongoose';
import { IAmmState, IResolutionSource, MarketCategoryType, MarketStatus, ResolutionSourceType } from './market.types';





export interface IMarket extends Document {
  slug: string;
  question: string;
  category: MarketCategoryType;
  status: MarketStatus;
  outcomes: ['YES', 'NO'];
  resolutionSource: IResolutionSource;
  resolvedOutcome: 'YES' | 'NO' | null;
  resolvedAt: Date | null;
  closeAt: Date;
  createdBy: Types.ObjectId;
  ammState: IAmmState;
  orderBookEnabled: boolean;
  ammEnabled: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IMarketModel extends Model<IMarket> {}

const ammStateSubSchema = new Schema(
  {
    q_yes: {
      type: Number,
      required: [true, 'ammState.q_yes is required'],
      default: 1000,
      min: [0, 'ammState.q_yes cannot be negative'],
    },
    q_no: {
      type: Number,
      required: [true, 'ammState.q_no is required'],
      default: 1000,
      min: [0, 'ammState.q_no cannot be negative'],
    },
    b: {
      type: Number,
      required: [true, 'ammState.b is required'],
      default: 100,
      min: [0, 'ammState.b cannot be negative'],
    },
    totalLiquidity: {
      type: Number,
      required: [true, 'ammState.totalLiquidity is required'],
      default: 10000,
      min: [0, 'ammState.totalLiquidity cannot be negative'],
    },
    lastUpdatedAt: {
      type: Date,
      required: [true, 'ammState.lastUpdatedAt is required'],
      default: Date.now,
    },
  },
  { _id: false }
);

const resolutionSourceSubSchema = new Schema<IResolutionSource>(
  {
    type: {
      type: String,
      enum: {
        values: Object.values(ResolutionSourceType),
        message: `Resolution source type must be one of: ${Object.values(ResolutionSourceType).join(', ')}`,
      },
      required: [true, 'Resolution source type is required'],
      default: ResolutionSourceType.ORACLE,
    },
    provider: {
      type: String,
      required: [true, 'Resolution source provider is required'],
      trim: true,
    },
    referenceId: {
      type: String,
      required: [true, 'Resolution source reference ID is required'],
      trim: true,
    },
  },
  { _id: false }
);

const marketSchema = new Schema<IMarket, IMarketModel>(
  {
    slug: {
      type: String,
      required: [true, 'Slug is required'],
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    question: {
      type: String,
      required: [true, 'Question is required'],
      trim: true,
      minlength: [5, 'Question must be at least 5 characters'],
      maxlength: [300, 'Question cannot exceed 300 characters'],
    },
    category: {
      type: String,
      enum: {
        values: Object.values(MarketCategoryType),
        message: `Category must be one of: ${Object.values(MarketCategoryType).join(', ')}`,
      },
      required: [true, 'Category is required'],
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: Object.values(MarketStatus),
        message: `Status must be one of: ${Object.values(MarketStatus).join(', ')}`,
      },
      default: MarketStatus.OPEN,
      index: true,
    },
    outcomes: {
      type: [String],
      enum: {
        values: ['YES', 'NO'],
        message: 'Outcomes must only include YES and NO',
      },
      default: ['YES', 'NO'],
      validate: {
        validator: (value: string[]) =>
          Array.isArray(value) && value.length === 2 && value.includes('YES') && value.includes('NO'),
        message: 'Outcomes must be exactly [YES, NO]',
      },
    },
    resolutionSource: {
      type: resolutionSourceSubSchema as any,
      required: [true, 'Resolution source is required'],
      default: {
        type: ResolutionSourceType.ORACLE,
        provider: 'cricbuzz',
        referenceId: '',
      },
    },
    resolvedOutcome: {
      type: String,
      enum: {
        values: ['YES', 'NO', null],
        message: 'Resolved outcome must be YES, NO, or null',
      },
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    closeAt: {
      type: Date,
      required: [true, 'closeAt is required'],
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: [true, 'createdBy is required'],
      ref: 'User',
      index: true,
    },
    ammState: {
      type: ammStateSubSchema as any,
      required: [true, 'ammState is required'],
      default: {
        q_yes: 1000,
        q_no: 1000,
        b: 100,
        totalLiquidity: 10000,
      },
    },
    orderBookEnabled: {
      type: Boolean,
      default: true,
    },
    ammEnabled: {
      type: Boolean,
      default: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

marketSchema.pre('save', function (this: IMarket) {
  if (this.isModified('ammState')) {
    this.ammState.lastUpdatedAt = new Date();
  }

  if (this.isModified('status') && this.status !== MarketStatus.RESOLVED) {
    this.resolvedOutcome = null;
    this.resolvedAt = null;
  }

  if (this.status === MarketStatus.RESOLVED && !this.resolvedAt) {
    this.resolvedAt = new Date();
  }
});

export const Market = model<IMarket, IMarketModel>('Market', marketSchema);
