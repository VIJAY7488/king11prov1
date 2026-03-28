import { Document, Model, Schema, Types, model } from 'mongoose';
import { OrderOutcome, OrderSide, OrderStatus, OrderType } from './order.types';



export interface IOrder extends Document {
  marketId: Types.ObjectId;
  userId: Types.ObjectId;
  outcome: OrderOutcome;
  side: OrderSide;
  orderType: OrderType;
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  status: OrderStatus;
  expiresAt: Date | null;
  lockedAmount: number;
  averageFillPrice: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrderModel extends Model<IOrder> {}

const orderSchema = new Schema<IOrder, IOrderModel>(
  {
    marketId: {
      type: Schema.Types.ObjectId,
      ref: 'Market',
      required: [true, 'marketId is required'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    outcome: {
      type: String,
      enum: {
        values: Object.values(OrderOutcome),
        message: `outcome must be one of: ${Object.values(OrderOutcome).join(', ')}`,
      },
      required: [true, 'outcome is required'],
      index: true,
    },
    side: {
      type: String,
      enum: {
        values: Object.values(OrderSide),
        message: `side must be one of: ${Object.values(OrderSide).join(', ')}`,
      },
      required: [true, 'side is required'],
      index: true,
    },
    orderType: {
      type: String,
      enum: {
        values: Object.values(OrderType),
        message: `orderType must be one of: ${Object.values(OrderType).join(', ')}`,
      },
      required: [true, 'orderType is required'],
      default: OrderType.LIMIT,
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
    filledQuantity: {
      type: Number,
      default: 0,
      min: [0, 'filledQuantity cannot be negative'],
    },
    remainingQuantity: {
      type: Number,
      required: [true, 'remainingQuantity is required'],
      min: [0, 'remainingQuantity cannot be negative'],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(OrderStatus),
        message: `status must be one of: ${Object.values(OrderStatus).join(', ')}`,
      },
      default: OrderStatus.OPEN,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    lockedAmount: {
      type: Number,
      required: [true, 'lockedAmount is required'],
      min: [0, 'lockedAmount cannot be negative'],
    },
    averageFillPrice: {
      type: Number,
      default: null,
      min: [0, 'averageFillPrice cannot be below 0'],
      max: [1, 'averageFillPrice cannot be above 1'],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

orderSchema.index({ marketId: 1, outcome: 1, side: 1, price: -1, createdAt: 1 });
orderSchema.index({ marketId: 1, outcome: 1, side: 1, price: 1, createdAt: 1 });
orderSchema.index({ userId: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, expiresAt: 1 });

orderSchema.pre('validate', function (this: IOrder) {
  if (this.filledQuantity > this.quantity) {
    throw new Error(`filledQuantity (${this.filledQuantity}) cannot exceed quantity (${this.quantity})`);
  }

  if (this.remainingQuantity !== this.quantity - this.filledQuantity) {
    this.remainingQuantity = this.quantity - this.filledQuantity;
  }

  if (this.remainingQuantity === 0 && this.filledQuantity === this.quantity) {
    this.status = OrderStatus.FILLED;
  } else if (this.filledQuantity > 0 && this.remainingQuantity > 0 && this.status === OrderStatus.OPEN) {
    this.status = OrderStatus.PARTIAL;
  }

  if (this.orderType === OrderType.MARKET && this.price <= 0) {
    this.price = 0;
  }
});

export const Order = model<IOrder, IOrderModel>('Order', orderSchema);
