import Joi from 'joi';
import { WithdrawalMethod, WithdrawalStatus } from './withdrawal.types';

export const createWithdrawalSchema = Joi.object({
  amount: Joi.number().min(50).precision(2).required()
    .messages({
      'number.base': 'Amount must be a number',
      'number.min': 'Minimum withdrawal amount is ₹50',
    }),

  method: Joi.string().valid(...Object.values(WithdrawalMethod)).required()
    .messages({ 'any.only': `Method must be one of: ${Object.values(WithdrawalMethod).join(', ')}` }),

  upiId: Joi.string().trim().when('method', {
    is: WithdrawalMethod.UPI,
    then: Joi.required(),
    otherwise: Joi.optional().allow('', null),
  }),

  accountHolderName: Joi.string().trim().when('method', {
    is: WithdrawalMethod.BANK,
    then: Joi.required(),
    otherwise: Joi.optional().allow('', null),
  }),

  accountNumber: Joi.string().trim().pattern(/^\d{9,18}$/).when('method', {
    is: WithdrawalMethod.BANK,
    then: Joi.required(),
    otherwise: Joi.optional().allow('', null),
  }).messages({ 'string.pattern.base': 'Account number must be 9 to 18 digits' }),

  ifscCode: Joi.string().trim().uppercase().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).when('method', {
    is: WithdrawalMethod.BANK,
    then: Joi.required(),
    otherwise: Joi.optional().allow('', null),
  }).messages({ 'string.pattern.base': 'Invalid IFSC format' }),

  note: Joi.string().trim().max(300).optional().allow(''),
});

export const reviewWithdrawalSchema = Joi.object({
  status: Joi.string()
    .valid(WithdrawalStatus.APPROVED, WithdrawalStatus.REJECTED)
    .required(),
  adminNote: Joi.string().trim().max(500).optional().allow(''),
});

export const withdrawalQuerySchema = Joi.object({
  status: Joi.string().valid(...Object.values(WithdrawalStatus)).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
