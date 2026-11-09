import { Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import type { AuthenticatedRequest } from './auth.middleware';

export function requireOwner(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401, 'NOT_AUTHENTICATED'));
  }
  if (req.user.role !== 'RESTAURANT_OWNER') {
    return next(
      new AppError(
        'Access denied. Restaurant owner access required.',
        403,
        'INSUFFICIENT_ROLE'
      )
    );
  }
  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401, 'NOT_AUTHENTICATED'));
  }
  if (req.user.role !== 'SUPER_ADMIN') {
    return next(
      new AppError('Access denied. Admin access required.', 403, 'INSUFFICIENT_ROLE')
    );
  }
  next();
}

export function requireOwnerOrAdmin(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401, 'NOT_AUTHENTICATED'));
  }
  if (req.user.role !== 'RESTAURANT_OWNER' && req.user.role !== 'SUPER_ADMIN') {
    return next(
      new AppError(
        'Access denied. Restaurant owner or admin access required.',
        403,
        'INSUFFICIENT_ROLE'
      )
    );
  }
  next();
}

export function requireKitchen(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401, 'NOT_AUTHENTICATED'));
  }
  if (req.user.role !== 'KITCHEN') {
    return next(
      new AppError('Access denied. Kitchen staff access required.', 403, 'INSUFFICIENT_ROLE')
    );
  }
  next();
}

export function requireOwnerOrKitchen(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401, 'NOT_AUTHENTICATED'));
  }
  if (
    req.user.role !== 'RESTAURANT_OWNER' &&
    req.user.role !== 'KITCHEN' &&
    req.user.role !== 'SUPER_ADMIN'
  ) {
    return next(
      new AppError(
        'Access denied. Restaurant owner or kitchen access required.',
        403,
        'INSUFFICIENT_ROLE'
      )
    );
  }
  next();
}
