import Joi from 'joi';

export const walletAmountSchema = Joi.object({
  amount: Joi.number().positive().precision(2).required().messages({
    'number.base': 'amount must be a number',
    'number.positive': 'amount must be greater than 0',
    'any.required': 'amount is required',
  }),
});
