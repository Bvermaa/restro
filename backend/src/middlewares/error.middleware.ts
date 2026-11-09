import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { Prisma } from '@prisma/client';

import multer from 'multer';
import { syncDatabaseSchema } from '../utils/autoSeed';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error('Error handler caught:', {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    url: req.originalUrl,
    method: req.method,
  });

  // Known operational errors
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  // Multer file upload errors
  if (error instanceof multer.MulterError || error.name === 'MulterError') {
    if ((error as multer.MulterError).code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        error: 'File is too large. Maximum allowed file size for menu documents is 50MB.',
        code: 'LIMIT_FILE_SIZE',
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: error.message || 'File upload error.',
      code: (error as multer.MulterError).code || 'UPLOAD_ERROR',
    });
    return;
  }

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[])?.join(', ') ?? 'field';
      res.status(409).json({
        success: false,
        error: `A record with this ${target} already exists.`,
        code: 'DUPLICATE_ENTRY',
      });
      return;
    }

    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: 'Record not found.',
        code: 'RECORD_NOT_FOUND',
      });
      return;
    }

    if (error.code === 'P2003') {
      res.status(400).json({
        success: false,
        error: 'Related record not found. Check foreign key references.',
        code: 'FOREIGN_KEY_CONSTRAINT',
      });
      return;
    }

    if (error.code === 'P2022' || error.code === 'P2021') {
      logger.error('Database schema missing column/table error:', error);
      syncDatabaseSchema().catch((err) => logger.error('On-demand schema sync failed:', err));
      res.status(500).json({
        success: false,
        error: 'Database schema updated. Please refresh the page now.',
        code: 'DATABASE_SCHEMA_MISMATCH',
      });
      return;
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      error: 'Invalid data provided.',
      code: 'DATABASE_VALIDATION_ERROR',
    });
    return;
  }

  // JWT errors (not caught in middleware)
  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: 'Invalid token.',
      code: 'TOKEN_INVALID',
    });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Token has expired.',
      code: 'TOKEN_EXPIRED',
    });
    return;
  }

  // Unknown errors
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    error: error.message || 'An unexpected error occurred. Please try again later.',
    code: 'INTERNAL_SERVER_ERROR',
  });
}
