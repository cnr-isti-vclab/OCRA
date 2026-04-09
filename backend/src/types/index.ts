/**
 * Backend type re-exports.
 *
 * All shared API types come from the 'shared' workspace package.
 * This file adds backend-only types that depend on Node/Express/MongoDB.
 */
import type { ObjectId } from 'mongodb';
import type { HDTDocument as _SharedHDTDocument } from 'shared';

// Re-export everything from the shared package (frontend-safe types).
// The local HDTDocument interface below shadows the shared one for backend use.
export type * from 'shared';

/**
 * Backend-internal override of HDTDocument.
 * _id is typed as ObjectId at the MongoDB layer; the shared type uses string
 * (the serialized form returned by API responses).
 */
export interface HDTDocument extends Omit<_SharedHDTDocument, '_id'> {
  _id?: ObjectId;
}

/** Express request extension populated by auth middleware. */
export interface AuthenticatedRequest {
  user?: import('shared').User;
  sessionId?: string;
}