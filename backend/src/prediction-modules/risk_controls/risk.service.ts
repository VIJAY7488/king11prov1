import { Types } from 'mongoose';
import AppError from '../../utils/AppError';
import { Market } from '../markets/market.model';
import { AmmPool } from '../amm_pools/amm.model';
import riskEngine from './risk.engine';
import { RiskControl } from './risk.model';

const round = (v: number): number => Number(v.toFixed(8));

class RiskService {
  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${label}.`, 400);
    return new Types.ObjectId(id);
  }

  async getMarketRisk(marketId: string) {
    const marketObjectId = this.toObjectId(marketId, 'marketId');
    const risk = await RiskControl.findOne({ marketId: marketObjectId });
    if (!risk) {
      await riskEngine.postTradeUpdate(marketId);
      const created = await RiskControl.findOne({ marketId: marketObjectId });
      if (!created) throw new AppError('Failed to initialize risk control.', 500);
      return created;
    }
    return risk;
  }

  async getMarketRiskSnapshot(marketId: string) {
    const snapshot = await riskEngine.getRealtimeSnapshot(marketId);
    if (!snapshot) throw new AppError('Risk snapshot not found.', 404);
    return snapshot;
  }

  async recomputeMarketRisk(marketId: string) {
    await riskEngine.postTradeUpdate(marketId);
    const snapshot = await riskEngine.syncRiskSnapshotToRedis(marketId);
    return snapshot;
  }

  async getKillSwitch() {
    const enabled = await riskEngine.isGlobalKillSwitchEnabled();
    return { enabled };
  }

  async setKillSwitch(enabled: boolean) {
    await riskEngine.setGlobalKillSwitch(enabled);
    return { enabled };
  }

  async updateMarketRiskControls(
    marketId: string,
    payload: {
      maxExposure?: number;
      ammEnabled?: boolean;
      orderBookEnabled?: boolean;
      marketFrozen?: boolean;
      circuitBreakerUntil?: string | null;
      maxOrderSizePerUser?: number;
      maxPositionPerUser?: number;
      baseB?: number;
      bMultiplier?: number;
      ammSideLimits?: {
        YES?: { maxSingleTrade?: number; enabled?: boolean };
        NO?: { maxSingleTrade?: number; enabled?: boolean };
      };
    }
  ) {
    const marketObjectId = this.toObjectId(marketId, 'marketId');
    await this.getMarketRisk(marketId);
    const risk = await RiskControl.findOne({ marketId: marketObjectId });
    if (!risk) throw new AppError('Risk control not found.', 404);

    if (typeof payload.maxExposure === 'number') risk.maxExposure = payload.maxExposure;
    if (typeof payload.ammEnabled === 'boolean') risk.ammEnabled = payload.ammEnabled;
    if (typeof payload.orderBookEnabled === 'boolean') risk.orderBookEnabled = payload.orderBookEnabled;
    if (typeof payload.marketFrozen === 'boolean') risk.marketFrozen = payload.marketFrozen;
    if (typeof payload.maxOrderSizePerUser === 'number') risk.maxOrderSizePerUser = payload.maxOrderSizePerUser;
    if (typeof payload.maxPositionPerUser === 'number') risk.maxPositionPerUser = payload.maxPositionPerUser;
    if (typeof payload.baseB === 'number') risk.baseB = payload.baseB;
    if (typeof payload.bMultiplier === 'number') risk.bMultiplier = payload.bMultiplier;
    if (payload.circuitBreakerUntil === null) risk.circuitBreakerUntil = null;
    if (typeof payload.circuitBreakerUntil === 'string') risk.circuitBreakerUntil = new Date(payload.circuitBreakerUntil);

    if (payload.ammSideLimits?.YES) {
      if (typeof payload.ammSideLimits.YES.maxSingleTrade === 'number') {
        risk.ammSideLimits.YES.maxSingleTrade = payload.ammSideLimits.YES.maxSingleTrade;
      }
      if (typeof payload.ammSideLimits.YES.enabled === 'boolean') {
        risk.ammSideLimits.YES.enabled = payload.ammSideLimits.YES.enabled;
      }
    }
    if (payload.ammSideLimits?.NO) {
      if (typeof payload.ammSideLimits.NO.maxSingleTrade === 'number') {
        risk.ammSideLimits.NO.maxSingleTrade = payload.ammSideLimits.NO.maxSingleTrade;
      }
      if (typeof payload.ammSideLimits.NO.enabled === 'boolean') {
        risk.ammSideLimits.NO.enabled = payload.ammSideLimits.NO.enabled;
      }
    }

    risk.adjustedB = round(Math.max(10, risk.baseB * risk.bMultiplier));
    await risk.save();

    await Market.updateOne(
      { _id: marketObjectId },
      {
        $set: {
          ammEnabled: risk.ammEnabled && !risk.marketFrozen,
          orderBookEnabled: risk.orderBookEnabled && !risk.marketFrozen,
          'ammState.b': risk.adjustedB,
        },
      }
    );
    await AmmPool.updateOne({ marketId: marketObjectId }, { $set: { b: risk.adjustedB } });

    await riskEngine.syncRiskSnapshotToRedis(marketId);
    return risk;
  }
}

export default new RiskService();
