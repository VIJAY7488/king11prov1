import Joi from "joi";

const mobileNumber = Joi.string()
    .pattern(/^\+?[1-9]\d{6,14}$/)
    .required()
    .messages({ 'string.pattern.base': 'Enter a valid mobile number (e.g. 9966897130)' });


const password = Joi.string()
    .min(6)
    .max(30)
    .required()
    .messages({ 'string.min': 'Password must be at least 8 characters' });


export const registerSchema = Joi.object({
    name: Joi.string().min(3).max(30).required(),
    mobileNumber,
    telegramUsername: Joi.string()
        .trim()
        .lowercase()
        .pattern(/^[a-zA-Z0-9_]{5,32}$/)
        .optional()
        .messages({ 'string.pattern.base': 'Telegram username must be 5–32 alphanumeric characters or underscores' }),
    password,
});

export const loginSchema = Joi.object({
    mobileNumber,
    password: Joi.string().required()
});

export const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string().optional(),
});

export const updateProfileSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    telegramUsername: Joi.string()
        .trim()
        .lowercase()
        .pattern(/^[a-zA-Z0-9_]{5,32}$/)
        .optional()
        .allow(''),
}).min(1);


export const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: password,
});
