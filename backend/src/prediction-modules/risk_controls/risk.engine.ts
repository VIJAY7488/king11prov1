import { ClientSession, Types } from 'mongoose';
import redisClient from '../../config/redis.config';
import AppError from '../../utils/AppError';
import { Market } from '../markets/market.model';
import { AmmPool } from '../amm_pools/amm.model';
import holdingService from '../holdings/holding.service';
import { RiskControl, IRiskControl } from './risk.model';
import { RiskAlertType, RiskCheckResult, RiskPreTradeInput, RiskRealtimeSnapshot } from './risk.types';

const round = (v: number): number => Number(v.toFixed(8));

const GLOBAL_KILL_SWITCH_KEY = 'risk:global:kill_switch';
const marketSnapshotKey = (marketId: string): string => `risk:market:${marketId}:snapshot`;
const fraudVelocityKey = (userId: string, marketId: string): string =>
  `risk:fraud:user:${userId}:market:${marketId}:velocity_60s`;

class RiskEngine {
  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${label}.`, 400);
    return new Types.ObjectId(id);
  }

  private computeControls(utilization: number): { spreadBps: number; bMultiplier: number } {
    if (utilization >= 1.0) return { spreadBps: 300, bMultiplier: 0.6 };
    if (utilization >= 0.85) return { spreadBps: 180, bMultiplier: 0.75 };
    if (utilization >= 0.7) return { spreadBps: 80, bMultiplier: 0.9 };
    return { spreadBps: 0, bMultiplier: 1 };
  }

  private async getOrCreateRiskControl(
    marketId: string,
    session?: ClientSession
  ): Promise<IRiskControl> {
    const marketObjectId = this.toObjectId(marketId, 'marketId');
    let query = RiskControl.findOne({ marketId: marketObjectId });
    if (session) query = query.session(session);
    let risk = await query;
    if (risk) return risk;

    const marketQuery = Market.findById(marketObjectId);
    if (session) marketQuery.session(session);
    const market = await marketQuery;
    if (!market) throw new AppError('Market not found.', 404);

    const [created] = await RiskControl.create(
      [
        {
          marketId: marketObjectId,
          maxExposure: 500_000,
          currentExposure: 0,
          yesExposure: 0,
          noExposure: 0,
          netExposure: 0,
          ammEnabled: market.ammEnabled,
          orderBookEnabled: market.orderBookEnabled,
          baseB: market.ammState.b ?? 100,
          adjustedB: market.ammState.b ?? 100,
          ammSideLimits: {
            YES: { maxSingleTrade: 5000, enabled: true },
            NO: { maxSingleTrade: 5000, enabled: true },
          },
        },
      ],
      session ? { session } : undefined
    );
    return created;
  }

  async isGlobalKillSwitchEnabled(): Promise<boolean> {
    const value = await redisClient.get(GLOBAL_KILL_SWITCH_KEY);
    return value === '1';
  }

  async setGlobalKillSwitch(enabled: boolean): Promise<void> {
    await redisClient.set(GLOBAL_KILL_SWITCH_KEY, enabled ? '1' : '0');
  }

  async preTradeCheck(input: RiskPreTradeInput, session?: ClientSession): Promise<RiskCheckResult> {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new AppError('quantity must be greater than 0.', 400);
    }

    const globalKill = await this.isGlobalKillSwitchEnabled();
    if (globalKill && input.route === 'AMM') {
      throw new AppError('AMM disabled by global kill switch.', 409);
    }

    const risk = await this.getOrCreateRiskControl(input.marketId, session);
    const now = Date.now();
    if (risk.marketFrozen) throw new AppError('Market is frozen by risk controls.', 409);
    if (risk.circuitBreakerUntil && risk.circuitBreakerUntil.getTime() > now) {
      throw new AppError('Market is temporarily halted by circuit breaker.', 409);
    }

    if (input.route === 'AMM' && !risk.ammEnabled) throw new AppError('AMM disabled by risk controls.', 409);
    if (input.route === 'ORDER_BOOK' && !risk.orderBookEnabled) throw new AppError('Order Book disabled by risk controls.', 409);

    if (input.quantity > risk.maxOrderSizePerUser) {
      throw new AppError(`Order size exceeds maxOrderSizePerUser (${risk.maxOrderSizePerUser}).`, 409);
    }

    if (input.route === 'AMM') {
      const sideLimit = risk.ammSideLimits?.[input.outcome];
      if (!sideLimit?.enabled) throw new AppError(`${input.outcome} side is disabled by risk controls.`, 409);
      if (input.quantity > sideLimit.maxSingleTrade) {
        throw new AppError(`Quantity exceeds side maxSingleTrade (${sideLimit.maxSingleTrade}).`, 409);
      }
    }

    if (!input.skipUserPositionCheck) {
      const userPositions = await holdingService.getUserHoldings(input.userId, input.marketId, session);
      const userCurrentQty = userPositions
        .filter((p) => p.outcome === input.outcome)
        .reduce((acc, p) => acc + p.quantity, 0);
      const projectedUserQty = input.side === 'BUY' ? userCurrentQty + input.quantity : userCurrentQty - input.quantity;
      if (projectedUserQty > risk.maxPositionPerUser) {
        throw new AppError(`Position limit exceeded (${risk.maxPositionPerUser}) for user in this market/outcome.`, 409);
      }
      if (projectedUserQty < 0) {
        throw new AppError('Insufficient position quantity for this sell operation.', 409);
      }

      // Velocity-based suspicious activity heuristic.
      const velocity = await redisClient.incr(fraudVelocityKey(input.userId, input.marketId));
      if (velocity === 1) await redisClient.expire(fraudVelocityKey(input.userId, input.marketId), 60);
      if (velocity > 40 || input.quantity > risk.maxOrderSizePerUser * 0.8) {
        risk.alerts.push({
          type: RiskAlertType.SUSPICIOUS_ACTIVITY,
          triggeredAt: new Date(),
          threshold: 40,
          value: velocity,
          resolved: false,
        });
        if (session) await risk.save({ session });
        else await risk.save();
        if (velocity > 80) {
          throw new AppError('Trade blocked due to suspicious high-frequency activity.', 429);
        }
      }
    }

    // AMM projected exposure check: order-book trades are user-to-user and do not increase platform liability.
    if (input.route === 'AMM') {
      let projectedYes = risk.yesExposure;
      let projectedNo = risk.noExposure;
      if (input.outcome === 'YES') {
        projectedYes = round(Math.max(0, projectedYes + (input.side === 'BUY' ? input.quantity : -input.quantity)));
      } else {
        projectedNo = round(Math.max(0, projectedNo + (input.side === 'BUY' ? input.quantity : -input.quantity)));
      }
      const projectedWorst = Math.max(projectedYes, projectedNo);
      if (projectedWorst > risk.maxExposure) {
        throw new AppError(
          `Risk limit exceeded: projected exposure ${projectedWorst} > maxExposure ${risk.maxExposure}.`,
          409
        );
      }
    }

    const controls = this.computeControls(risk.exposureUtilization);
    return {
      allowed: true,
      controls: {
        spreadBps: controls.spreadBps,
        bMultiplier: controls.bMultiplier,
        maxAllowedQty: Math.min(
          risk.maxOrderSizePerUser,
          risk.ammSideLimits[input.outcome]?.maxSingleTrade ?? risk.maxOrderSizePerUser
        ),
      },
    };
  }

  async postTradeUpdate(marketId: string, session?: ClientSession): Promise<IRiskControl> {
    const risk = await this.getOrCreateRiskControl(marketId, session);
    const exposure = await holdingService.getMarketExposure(marketId, session);

    risk.yesExposure = round(exposure.yesExposure);
    risk.noExposure = round(exposure.noExposure);
    risk.currentExposure = round(Math.max(exposure.yesExposure, exposure.noExposure));
    risk.netExposure = round(exposure.yesExposure - exposure.noExposure);
    risk.exposureUtilization = risk.maxExposure > 0 ? round(risk.currentExposure / risk.maxExposure) : 0;
    risk.imbalanceRatio = exposure.noExposure > 0 ? round(exposure.yesExposure / exposure.noExposure) : (exposure.yesExposure > 0 ? 999999 : 1);

    const controls = this.computeControls(risk.exposureUtilization);
    risk.dynamicSpreadBps = controls.spreadBps;
    risk.bMultiplier = controls.bMultiplier;

    // Dynamic pricing control: adjust AMM b as utilization rises.
    const marketObjectId = this.toObjectId(marketId, 'marketId');
    const poolQuery = AmmPool.findOne({ marketId: marketObjectId });
    if (session) poolQuery.session(session);
    const pool = await poolQuery;
    if (!risk.baseB || risk.baseB <= 0) {
      risk.baseB = pool?.b ?? 100;
    }
    risk.adjustedB = round(Math.max(10, risk.baseB * controls.bMultiplier));

    // Safety controls
    if (risk.exposureUtilization >= 1.0) {
      risk.ammEnabled = false;
      risk.alerts.push({
        type: RiskAlertType.HIGH_EXPOSURE,
        triggeredAt: new Date(),
        threshold: 1,
        value: risk.exposureUtilization,
        resolved: false,
      });
    }

    if (risk.imbalanceRatio >= 2.5) {
      risk.circuitBreakerUntil = new Date(Date.now() + 60_000);
      risk.alerts.push({
        type: RiskAlertType.CIRCUIT_BREAKER,
        triggeredAt: new Date(),
        threshold: 2.5,
        value: risk.imbalanceRatio,
        resolved: false,
      });
    }

    if (risk.imbalanceRatio >= 5) {
      risk.marketFrozen = true;
      risk.ammEnabled = false;
      risk.orderBookEnabled = false;
    }

    if (session) await risk.save({ session });
    else await risk.save();

    const marketQuery = Market.findById(marketObjectId);
    if (session) marketQuery.session(session);
    const market = await marketQuery;
    if (market) {
      market.ammEnabled = risk.ammEnabled && !risk.marketFrozen;
      market.orderBookEnabled = risk.orderBookEnabled && !risk.marketFrozen;
      market.ammState.b = risk.adjustedB;
      if (session) await market.save({ session });
      else await market.save();
    }

    if (pool) {
      pool.b = risk.adjustedB;
      if (session) await pool.save({ session });
      else await pool.save();
    }

    return risk;
  }

  private toSnapshot(risk: IRiskControl): RiskRealtimeSnapshot {
    return {
      marketId: risk.marketId.toString(),
      maxExposure: risk.maxExposure,
      currentExposure: risk.currentExposure,
      yesExposure: risk.yesExposure,
      noExposure: risk.noExposure,
      netExposure: risk.netExposure,
      exposureUtilization: risk.exposureUtilization,
      imbalanceRatio: risk.imbalanceRatio,
      ammEnabled: risk.ammEnabled,
      orderBookEnabled: risk.orderBookEnabled,
      marketFrozen: risk.marketFrozen,
      circuitBreakerUntil: risk.circuitBreakerUntil ? risk.circuitBreakerUntil.toISOString() : null,
      dynamicSpreadBps: risk.dynamicSpreadBps,
      adjustedB: risk.adjustedB,
      updatedAt: risk.updatedAt.toISOString(),
    };
  }

  async syncRiskSnapshotToRedis(marketId: string): Promise<RiskRealtimeSnapshot | null> {
    const risk = await RiskControl.findOne({ marketId: this.toObjectId(marketId, 'marketId') });
    if (!risk) return null;
    const snapshot = this.toSnapshot(risk);
    await redisClient.set(marketSnapshotKey(marketId), JSON.stringify(snapshot), 'EX', 120);
    return snapshot;
  }

  async getRealtimeSnapshot(marketId: string): Promise<RiskRealtimeSnapshot | null> {
    const cached = await redisClient.get(marketSnapshotKey(marketId));
    if (cached) {
      try {
        return JSON.parse(cached) as RiskRealtimeSnapshot;
      } catch {
        // ignore parse issue and refresh from DB
      }
    }
    return this.syncRiskSnapshotToRedis(marketId);
  }
}

export default new RiskEngine();
