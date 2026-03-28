import { Types } from 'mongoose';
import redisClient from '../../config/redis.config';
import AppError from '../../utils/AppError';
import { AmmPool } from '../amm_pools/amm.model';
import { Holding } from '../holdings/holding.model';
import { Market } from './market.model';
import { MarketStatus } from './market.types';
import { Order, IOrder } from '../orderbook/order.model';
import { OrderStatus } from '../orderbook/order.types';
import { RiskControl } from '../risk_controls/risk.model';
import { Settlement } from '../settlements/settlement.model';
import { Trade } from '../trades/trade.model';

class MarketService {
  private round(value: number): number {
    return Number(value.toFixed(8));
  }

  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${label}.`, 400);
    return new Types.ObjectId(id);
  }

  private buildNeutralAmmState(
    rawAmmState: unknown
  ): { q_yes: number; q_no: number; b: number; totalLiquidity: number } {
    const ammState =
      rawAmmState && typeof rawAmmState === 'object'
        ? (rawAmmState as Record<string, unknown>)
        : {};

    const b = Number(ammState.b ?? 100);
    const totalLiquidity = Number(ammState.totalLiquidity ?? 10000);
    const defaultMid = Math.max(1000, b * 10);
    const providedBase = Number(ammState.q_yes ?? ammState.q_no ?? defaultMid);
    const mid = Number.isFinite(providedBase) && providedBase > 0
      ? providedBase
      : defaultMid;

    return {
      q_yes: this.round(mid),
      q_no: this.round(mid),
      b: this.round(b),
      totalLiquidity: this.round(totalLiquidity),
    };
  }

  async createMarket(adminUserId: string, payload: Record<string, unknown>) {
    const createdBy = this.toObjectId(adminUserId, 'adminUserId');
    const input: Record<string, unknown> = { ...payload };

    delete input.initialPriceYes;
    input.ammState = this.buildNeutralAmmState(input.ammState);

    const doc = await Market.create({
      ...input,
      createdBy,
      resolvedOutcome: null,
      resolvedAt: null,
    });

    return doc;
  }

  async listMarkets(query: {
    category?: string;
    status?: string;
    slug?: string;
    tags?: string[] | string;
    createdBy?: string;
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'updatedAt' | 'closeAt';
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.category) filter.category = query.category;
    if (query.status) filter.status = query.status;
    if (query.slug) filter.slug = query.slug.toLowerCase();
    if (query.createdBy) filter.createdBy = this.toObjectId(query.createdBy, 'createdBy');
    if (query.tags) {
      const tags = Array.isArray(query.tags) ? query.tags : query.tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (tags.length > 0) filter.tags = { $in: tags };
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const [markets, total] = await Promise.all([
      Market.find(filter).sort({ [sortBy]: sortOrder }).skip(skip).limit(limit),
      Market.countDocuments(filter),
    ]);

    return {
      markets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMarketById(marketId: string) {
    const id = this.toObjectId(marketId, 'marketId');
    const market = await Market.findById(id);
    if (!market) throw new AppError('Market not found.', 404);
    return market;
  }

  async updateMarket(marketId: string, payload: Record<string, unknown>) {
    const id = this.toObjectId(marketId, 'marketId');
    const market = await Market.findById(id);
    if (!market) throw new AppError('Market not found.', 404);

    Object.assign(market, payload);
    await market.save();
    return market;
  }

  async deleteMarket(marketId: string) {
    const id = this.toObjectId(marketId, 'marketId');
    const market = await Market.findById(id);
    if (!market) throw new AppError('Market not found.', 404);

    const [openOrdersCount, tradesCount, activeHoldingsCount, settlement] = await Promise.all([
      Order.countDocuments({
        marketId: id,
        status: { $in: [OrderStatus.OPEN, OrderStatus.PARTIAL] },
      }),
      Trade.countDocuments({ marketId: id }),
      Holding.countDocuments({ marketId: id, quantity: { $gt: 0 } }),
      Settlement.findOne({ marketId: id }).select('_id status').lean(),
    ]);

    if (openOrdersCount > 0 || tradesCount > 0 || activeHoldingsCount > 0 || settlement) {
      throw new AppError(
        'This question cannot be deleted after trading activity, open orders, holdings, or settlement records exist.',
        409
      );
    }

    await Promise.all([
      Order.deleteMany({ marketId: id }),
      Trade.deleteMany({ marketId: id }),
      Holding.deleteMany({ marketId: id }),
      AmmPool.deleteOne({ marketId: id }),
      RiskControl.deleteOne({ marketId: id }),
      Settlement.deleteOne({ marketId: id }),
      Market.deleteOne({ _id: id }),
    ]);

    await redisClient.del(
      `ob:${marketId}:YES:buy`,
      `ob:${marketId}:YES:sell`,
      `ob:${marketId}:NO:buy`,
      `ob:${marketId}:NO:sell`,
      `lock:match:${marketId}:YES`,
      `lock:match:${marketId}:NO`,
      `lock:smart-router:${marketId}:YES`,
      `lock:smart-router:${marketId}:NO`,
      `risk:market:${marketId}:snapshot`
    );

    return { marketId, deleted: true };
  }

  async closeExpiredMarkets() {
    const now = new Date();
    const result = await Market.updateMany(
      { status: MarketStatus.OPEN, closeAt: { $lte: now } },
      { $set: { status: MarketStatus.CLOSED, ammEnabled: false, orderBookEnabled: false } }
    );
    return { updated: result.modifiedCount };
  }
}

export default new MarketService();
