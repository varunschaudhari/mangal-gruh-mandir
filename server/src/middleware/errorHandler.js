import ApiError from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
  let error = err;

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new ApiError(409, `${field} already exists`);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    error = new ApiError(400, messages.join(', '));
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    error = new ApiError(400, `Invalid ${err.path}: ${err.value}`);
  }

  const statusCode = error.statusCode || 500;
  const message    = error.message    || 'Internal Server Error';

  // Always log 5xx — these are genuine server faults, not client errors
  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${statusCode} ${message}`, {
      user:   req.user?.email,
      stack:  err.stack,
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors: error.errors || [],
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export default errorHandler;
