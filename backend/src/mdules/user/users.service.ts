import jwt from 'jsonwebtoken';
import AppError from "../../utils/AppError";
import User, { IUser, UserRole } from "./users.model";
import { AuthResponse, AuthTokens, ChangePasswordDTO, JwtPayload, LoginDTO, RegisterDTO, UpdateProfileDTO, UserPublicProfile } from "./users.types";
import config from '../../config/env';
import referralService from '../referral/referral.service';



// ── Token Helpers ─────────────────────────────────────────────────────────────
const signTokens = (user: IUser): AuthTokens => {
    const payload: JwtPayload = {
        sub: user._id.toString(),
        mobile: user.mobileNumber,
        role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions);


    const refreshToken = jwt.sign(payload, config.jwtRefreshSecret, {
        expiresIn: config.jwtRefreshExpiresIn,
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
};


const toPublicProfile = (user: IUser): UserPublicProfile => ({
    id: user._id.toString(),
    name: user.name,
    mobileNumber: user.mobileNumber,
    role: user.role,
    walletBalance: user.walletBalance,
    withdrawableBalance: user.withdrawableBalance,
    nonWithdrawableBonusBalance: user.nonWithdrawableBonusBalance,
    referralCode: user.referralCode,
    isActive: user.isActive,
    createdAt: user.createdAt,
})

const buildCandidateReferralCode = (): string => {
    const suffix = Math.floor(100000 + Math.random() * 900000).toString();
    return `KING${suffix}`;
};


// ── Service ───────────────────────────────────────────────────────────────────
export class UserService {
    private async generateUniqueReferralCode(_name: string): Promise<string> {
        for (let i = 0; i < 20; i += 1) {
            const code = buildCandidateReferralCode();
            const existing = await User.exists({ referralCode: code });
            if (!existing) return code;
        }

        throw new AppError('Unable to generate referral code. Please try again.', 500);
    }

    private async ensureReferralCode(user: IUser): Promise<IUser> {
        if (user.referralCode) return user;
        user.referralCode = await this.generateUniqueReferralCode(user.name);
        await user.save();
        return user;
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    async register(dto: RegisterDTO): Promise<AuthResponse> {
        const existing = await User.findOne({mobileNumber: dto.mobileNumber});

        if(existing) {
            throw new AppError('An account with this mobile number already exists.', 409)
        };

        const normalizedReferralCode = dto.referralCode?.trim().toUpperCase();
        let referrerId: string | null = null;

        if (normalizedReferralCode) {
            const referrer = await User.findOne({ referralCode: normalizedReferralCode });
            if (!referrer) {
                throw new AppError('Invalid referral code.', 400);
            }
            if (!referrer.isActive) {
                throw new AppError('Referral code belongs to an inactive account.', 400);
            }
            referrerId = referrer._id.toString();
        }

        const referralCode = await this.generateUniqueReferralCode(dto.name);

        const user = await User.create({
            name: dto.name,
            mobileNumber: dto.mobileNumber,
            password: dto.password, // hashed via pre-save hook
            role: UserRole.USER,
            referralCode,
        });

        if (referrerId && referrerId !== user._id.toString()) {
            await referralService.createPendingReferral(referrerId, user._id.toString(), normalizedReferralCode!);
        }

        const tokens = signTokens(user);
        return { user: toPublicProfile(user), tokens };
    };

    async login(dto: LoginDTO): Promise<AuthResponse> {
        const user = await User.findByMobile(dto.mobileNumber);

        if (!user || !(await user.comparePassword(dto.password))){
            throw new AppError('Invalid mobile number or password.', 401);
        };

        if (!user.isActive) {
            throw new AppError('Your account has been deactivated. Please contact support.', 403);
        };

        const safeUser = await this.ensureReferralCode(user);
        const tokens = signTokens(safeUser);
        return { user: toPublicProfile(safeUser), tokens };
    };

    async refreshTokens(refreshToken: string): Promise<AuthTokens> {
        let payload: JwtPayload;

        try {
            payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as JwtPayload;
        } catch  {
            throw new AppError('Invalid or expired refresh token.', 401);
        }

        const user = await User.findById(payload.sub);
        if (!user || !user.isActive) {
            throw new AppError('User not found or deactivated.', 401);
        };

        return signTokens(user);
    };


    // ── Profile ───────────────────────────────────────────────────────────────

    async getProfile(userId: string): Promise<UserPublicProfile> {
        const user = await User.findById(userId);
        if (!user) throw new AppError('User not found.', 404);
        const safeUser = await this.ensureReferralCode(user);
        return toPublicProfile(safeUser);
    };

    async updateProfile(userId: string, dto: UpdateProfileDTO): Promise<UserPublicProfile> {
        if (Object.keys(dto).length === 0) {
            throw new AppError('No update fields provided.', 400);
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: dto },
            { new: true, runValidators: true }
        );

        if (!user) throw new AppError('User not found.', 404);
        return toPublicProfile(user);
    };

    async changePassword(userId: string, dto: ChangePasswordDTO): Promise<void> {
        const user = await User.findById(userId).select('+password');
        if (!user) throw new AppError('User not found.', 404);

        const isMatch = await user.comparePassword(dto.currentPassword);
        if (!isMatch) throw new AppError('Current password is incorrect.', 400);

        if (dto.currentPassword === dto.newPassword) {
            throw new AppError('New password must differ from the current password.', 400);
        }

        user.password = dto.newPassword; // re-hashed via pre-save hook
        await user.save();
    };
};

export default new UserService;
