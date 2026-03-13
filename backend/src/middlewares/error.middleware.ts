import { ErrorRequestHandler } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import AppError from '../utils/AppError';

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // App-level operational errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  // Validation and casting errors from libraries
  if (err instanceof Joi.ValidationError) {
    res.status(422).json({
      status: 'error',
      message: err.details.map((d) => d.message).join('; '),
    });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join('; ');
    res.status(422).json({
      status: 'error',
      message: message || 'Validation failed.',
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      status: 'error',
      message: `Invalid ${err.path}: "${err.value}".`,
    });
    return;
  }

  // Unexpected errors
  const message = err instanceof Error ? err.message : 'Internal server error.';
  console.error('❌ Unhandled API error:', err);
  res.status(500).json({
    status: 'error',
    message,
  });
};

export default errorHandler;
