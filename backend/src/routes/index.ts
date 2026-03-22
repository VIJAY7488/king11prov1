import { Router } from 'express';
import userRouter    from '../mdules/user/users.routes';
import depositRouter from '../mdules/deposit/deposit.routes';
import walletRouter  from '../mdules/wallet/wallet.routes';
import { publicContestRouter, userContestRouter } from '../mdules/contest/contest.routes';
import teamRouter    from '../mdules/team/team.routes';
import matchRouter   from '../mdules/match/match.routes';
import scoreRouter   from '../mdules/scores/score.routes';
import withdrawalRouter from '../mdules/withdrawal/withdrawal.routes';
import referralRouter from '../mdules/referral/referral.routes';

const router = Router();

// ── User / Auth ───────────────────────────────────────────────────────────────
router.use('/users', userRouter);

// ── Deposits & Wallet ────────────────────────────────────────────────────────
router.use('/users', depositRouter);
router.use('/users/wallet', walletRouter);
router.use('/users', withdrawalRouter);
router.use('/users', referralRouter);

// ── Contests ─────────────────────────────────────────────────────────────────
router.use('/', publicContestRouter);      // GET /contests, prize-table, admin create/update
router.use('/users', userContestRouter);   // POST /users/join-contest, GET /users/joined-contests

// ── Teams ────────────────────────────────────────────────────────────────────
router.use('/users', teamRouter);

// ── Matches ──────────────────────────────────────────────────────────────────
router.use('/', matchRouter);   // GET /matches, GET /matches/live, admin POST/PATCH

// ── Scores & Leaderboard ──────────────────────────────────────────────────────
router.use('/', scoreRouter);   // POST /scores/ball, GET /scores/match/:id, etc.

export default router;

