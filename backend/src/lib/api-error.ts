import type { Request, Response } from 'express';
import type { ApiErrorCode } from './api-error-codes.js';

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  status: number;
  requestId?: string;
  details?: unknown;
  timestamp: string;
  path?: string;
  method?: string;
}

export interface ApiErrorPayload {
  status: number;
  code: ApiErrorCode;
  error: string;
  details?: unknown;
}

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.error);
    this.name = 'ApiError';
    this.status = payload.status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

export function buildApiErrorResponse(req: Request, payload: ApiErrorPayload): ApiErrorResponse {
  return {
    success: false,
    error: payload.error,
    code: payload.code,
    status: payload.status,
    requestId: req.requestId,
    details: payload.details,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  };
}

export function sendApiError(req: Request, res: Response, payload: ApiErrorPayload): void {
  res.status(payload.status).json(buildApiErrorResponse(req, payload));
}

export function apiError(status: number, code: ApiErrorCode, error: string, details?: unknown) {
  return new ApiError({ status, code, error, details });
}