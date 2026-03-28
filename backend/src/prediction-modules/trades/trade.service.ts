import { Types } from 'mongoose';
import AppError from '../../utils/AppError';
import { Trade } from './trade.model';

class TradeService {
  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${label}.`, 400);
    return new Types.ObjectId(id);
  }

  async listTrades(query: {
    marketId?: string;
    outcome?: string;
    tradeType?: string;
    buyerId?: string;
    sellerId?: string;
    buyOrderId?: string;
    sellOrderId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
    sortBy?: 'executedAt' | 'createdAt' | 'price';
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.marketId) filter.marketId = this.toObjectId(query.marketId, 'marketId');
    if (query.outcome) filter.outcome = query.outcome;
    if (query.tradeType) filter.tradeType = query.tradeType;
    if (query.buyerId) filter.buyerId = this.toObjectId(query.buyerId, 'buyerId');
    if (query.sellerId) filter.sellerId = this.toObjectId(query.sellerId, 'sellerId');
    if (query.buyOrderId) filter.buyOrderId = this.toObjectId(query.buyOrderId, 'buyOrderId');
    if (query.sellOrderId) filter.sellOrderId = this.toObjectId(query.sellOrderId, 'sellOrderId');

    if (query.from || query.to) {
      const range: Record<string, Date> = {};
      if (query.from) range.$gte = new Date(query.from);
      if (query.to) range.$lte = new Date(query.to);
      filter.executedAt = range;
    }

    const sortBy = query.sortBy ?? 'executedAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const [trades, total] = await Promise.all([
      Trade.find(filter).sort({ [sortBy]: sortOrder, _id: -1 }).skip(skip).limit(limit),
      Trade.countDocuments(filter),
    ]);

    return {
      trades,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getTradeById(tradeId: string) {
    const id = this.toObjectId(tradeId, 'tradeId');
    const trade = await Trade.findById(id);
    if (!trade) throw new AppError('Trade not found.', 404);
    return trade;
  }

  async getMyTrades(userId: string, query: {
    marketId?: string;
    outcome?: string;
    tradeType?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
    sortBy?: 'executedAt' | 'createdAt' | 'price';
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      $or: [
        { buyerId: this.toObjectId(userId, 'userId') },
        { sellerId: this.toObjectId(userId, 'userId') },
      ],
    };
    if (query.marketId) filter.marketId = this.toObjectId(query.marketId, 'marketId');
    if (query.outcome) filter.outcome = query.outcome;
    if (query.tradeType) filter.tradeType = query.tradeType;
    if (query.from || query.to) {
      const range: Record<string, Date> = {};
      if (query.from) range.$gte = new Date(query.from);
      if (query.to) range.$lte = new Date(query.to);
      filter.executedAt = range;
    }

    const sortBy = query.sortBy ?? 'executedAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const [trades, total] = await Promise.all([
      Trade.find(filter).sort({ [sortBy]: sortOrder, _id: -1 }).skip(skip).limit(limit),
      Trade.countDocuments(filter),
    ]);

    return {
      trades,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export default new TradeService();
