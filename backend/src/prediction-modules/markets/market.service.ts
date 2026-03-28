import { Types } from 'mongoose';
import AppError from '../../utils/AppError';
import { Market } from './market.model';
import { MarketStatus } from './market.types';

class MarketService {
  private round(value: number): number {
    return Number(value.toFixed(8));
  }

  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${label}.`, 400);
    return new Types.ObjectId(id);
  }

  private deriveAmmStateFromInitialPrice(
    initialPriceYes: number,
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

    // LMSR price mapping:
    // p_yes = e^(q_yes / b) / (e^(q_yes / b) + e^(q_no / b))
    // => (q_yes - q_no) = b * ln(p_yes / (1 - p_yes))
    const logit = b * Math.log(initialPriceYes / (1 - initialPriceYes));
    let q_yes = mid + (logit / 2);
    let q_no = mid - (logit / 2);

    // Keep inventories positive.
    const minInventory = 1;
    if (q_yes < minInventory || q_no < minInventory) {
      const shift = minInventory - Math.min(q_yes, q_no);
      q_yes += shift;
      q_no += shift;
    }

    return {
      q_yes: this.round(q_yes),
      q_no: this.round(q_no),
      b: this.round(b),
      totalLiquidity: this.round(totalLiquidity),
    };
  }

  async createMarket(adminUserId: string, payload: Record<string, unknown>) {
    const createdBy = this.toObjectId(adminUserId, 'adminUserId');
    const input: Record<string, unknown> = { ...payload };

    const initialPriceYes = typeof input.initialPriceYes === 'number'
      ? input.initialPriceYes
      : undefined;

    delete input.initialPriceYes;

    if (typeof initialPriceYes === 'number') {
      input.ammState = this.deriveAmmStateFromInitialPrice(initialPriceYes, input.ammState);
    }

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
