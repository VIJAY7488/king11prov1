import { Document, Model, model, Schema, Types } from "mongoose";
import bcrypt from 'bcrypt';


// ── Enums ─────────────────────────────────────────────────────────────────────

export enum UserRole {
    USER  = 'USER',
    ADMIN = 'ADMIN',
}


// ── Interface ────────────────────────────────────────────────────────────────
export interface IUser extends Document {
    id: Types.ObjectId
    name: string;
    role: UserRole;
    mobileNumber: string;
    password: string;
    walletBalance: number;
    withdrawableBalance: number;
    nonWithdrawableBonusBalance: number;
    referralCode: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;

    // Instance methods
    comparePassword(candidatePassword: string): Promise<boolean>;
};

// Statics interface
export interface IUserModel extends Model<IUser> {
    findByMobile(mobileNumber: string): Promise<IUser | null>;
}

// ── Schema ───────────────────────────────────────────────────────────────────
const userSchema = new Schema<IUser>({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [3, 'Name must be at least 3 characters'],
        maxlength: [30, 'Name cannot exceed 30 characters'],
    },

    // Role is NEVER sent by the client — set only by backend/DB directly
    role: {
        type: String,
        enum: Object.values(UserRole),
        default: UserRole.USER,
    },

    mobileNumber: {
        type: String,
        required: [true, 'Mobile number is required'],
        unique: true,
        trim: true,
        match: [/^\+?[1-9]\d{6,14}$/, 'Please enter a valid mobile number'],
    },

    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false, // never returned in queries unless explicitly requested
    },

    walletBalance: {
        type: Number,
        default: 0,
        min: [0, 'Wallet balance cannot be negative'],
    },

    withdrawableBalance: {
        type: Number,
        default: 0,
        min: [0, 'Withdrawable balance cannot be negative'],
    },

    nonWithdrawableBonusBalance: {
        type: Number,
        default: 0,
        min: [0, 'Bonus balance cannot be negative'],
    },

    referralCode: {
        type: String,
        required: [true, 'Referral code is required'],
        unique: true,
        trim: true,
        uppercase: true,
        default: () => `USR${Math.floor(100000 + Math.random() * 900000)}`,
        minlength: [6, 'Referral code must be at least 6 characters'],
        maxlength: [20, 'Referral code cannot exceed 20 characters'],
    },

    isActive: {
        type: Boolean,
        default: true,
    },

}, {
    timestamps: true,           // auto-manages createdAt / updatedAt
    versionKey: false,          // removes __v field
    toJSON: {
      virtuals: true,
      transform(_doc, ret: any) {
        delete ret.password;    // extra safety — never leak hash via toJSON
        return ret;
      },
    },
});


// ── Indexes ──────────────────────────────────────────────────────────────────
userSchema.index({ createdAt: -1 });
userSchema.index({ referralCode: 1 }, { unique: true });


// ── Pre-save Hook: hash password ─────────────────────────────────────────────
userSchema.pre<IUser>('save', async function () {
    if (!this.isModified('password')) return;

    const SALTS_ROUND = 12;
    this.password = await bcrypt.hash(this.password, SALTS_ROUND);
});


// ── Instance Method: comparePassword ────────────────────────────────────────
userSchema.methods.comparePassword = async function (
    candidatePassword: string
): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
};


// ── Static Method: findByMobile ───────────────────────────────────────────────
userSchema.statics.findByMobile = function (
    mobileNumber: string
): Promise<IUser | null> {
    return this.findOne({ mobileNumber }).select('+password');
};



// ── Model ────────────────────────────────────────────────────────────────────
const User = model<IUser, IUserModel>('User', userSchema);
export default User;
