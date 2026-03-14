import { UserRole } from "./users.model";

// ── Request DTOs ─────────────────────────────────────────────────────────────
export interface RegisterDTO {
    name: string;
    mobileNumber: string;
    password: string;
};

export interface LoginDTO {
    mobileNumber: string;
    password: string;
};

export interface UpdateProfileDTO {
  name?: string;
};

export interface ChangePasswordDTO {
  currentPassword: string;
  newPassword: string;
};


// ── Response Shapes ──────────────────────────────────────────────────────────
export interface UserPublicProfile {
  id: string;
  name: string;
  mobileNumber: string;
  role: UserRole;
  walletBalance: number;
  isActive: boolean;
  createdAt: Date;
};

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
};

export interface AuthResponse {
  user: UserPublicProfile;
  tokens: AuthTokens;
};


// ── JWT Payload ───────────────────────────────────────────────────────────────
export interface JwtPayload {
  sub: string;       // user._id as string
  mobile: string;
  role: UserRole;
  iat?: number;
  exp?: number;
};


// ── Extend Express Request ────────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        mobile: string;
        role: UserRole;
      };
    }
  }
}
