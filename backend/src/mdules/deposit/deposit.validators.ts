import Joi from 'joi';
import { DepositStatus } from './deposite.types';


export const createDepositSchema = Joi.object({
  amount: Joi.number()
    .positive()
    .precision(2)
    .min(50)
    .max(1_000_000)
    .required()
    .messages({
      'number.positive': 'Amount must be greater than 0',
      'number.min': 'Minimum deposit is 50',
    }),

  // String — ref numbers can have letters, hyphens, leading zeros (UTR, UPI)
  refNumber: Joi.string()
    .trim()
    .min(4)
    .max(100)
    .required()
    .messages({ 'string.empty': 'Reference number is required' }),

  bonusCode: Joi.string()
    .trim()
    .uppercase()
    .alphanum()
    .min(6)
    .max(30)
    .empty('')
    .optional(),

});

export const reviewDepositSchema = Joi.object({
  status: Joi.string()
    .valid(DepositStatus.APPROVED, DepositStatus.REJECTED)
    .required(),

});

export const depositQuerySchema = Joi.object({
  status:    Joi.string().valid(...Object.values(DepositStatus)).optional(),
  page:      Joi.number().integer().min(1).default(1),
  limit:     Joi.number().integer().min(1).max(100).default(20),
  startDate: Joi.string().isoDate().optional(),
  endDate:   Joi.string().isoDate().optional(),
});
