import { describe, expect, it } from 'vitest';
import {
  applyDeletionIntentAutoLink,
  canBeginDeletionWizard,
  validateDeletionSetup,
} from './annotationDeletionValidation';

describe('annotationDeletionValidation', () => {
  it('rejects empty intent', () => {
    expect(validateDeletionSetup({
      deleteLink: false,
      deleteGeometry: false,
      deleteData: false,
    }).ok).toBe(false);
  });

  it('accepts link-only', () => {
    expect(validateDeletionSetup({
      deleteLink: true,
      deleteGeometry: false,
      deleteData: false,
    }).ok).toBe(true);
  });

  it('accepts geometry without link (ghost path)', () => {
    expect(validateDeletionSetup({
      deleteLink: false,
      deleteGeometry: true,
      deleteData: false,
    }).ok).toBe(true);
  });

  it('accepts data without link (ghost path)', () => {
    expect(validateDeletionSetup({
      deleteLink: false,
      deleteGeometry: false,
      deleteData: true,
    }).ok).toBe(true);
  });

  it('accepts geometry + link, data + link, and full triplet', () => {
    expect(canBeginDeletionWizard({
      deleteLink: true,
      deleteGeometry: true,
      deleteData: false,
    })).toBe(true);
    expect(canBeginDeletionWizard({
      deleteLink: true,
      deleteGeometry: false,
      deleteData: true,
    })).toBe(true);
    expect(canBeginDeletionWizard({
      deleteLink: true,
      deleteGeometry: true,
      deleteData: true,
    })).toBe(true);
  });

  it('merges intent patches without forcing link', () => {
    expect(applyDeletionIntentAutoLink(
      { deleteGeometry: true },
      { deleteLink: false, deleteGeometry: false, deleteData: false },
    )).toEqual({
      deleteLink: false,
      deleteGeometry: true,
      deleteData: false,
    });

    expect(applyDeletionIntentAutoLink(
      { deleteData: true },
      { deleteLink: false, deleteGeometry: false, deleteData: false },
    )).toEqual({
      deleteLink: false,
      deleteGeometry: false,
      deleteData: true,
    });

    expect(applyDeletionIntentAutoLink(
      { deleteLink: true, deleteGeometry: true },
      { deleteLink: false, deleteGeometry: false, deleteData: false },
    )).toEqual({
      deleteLink: true,
      deleteGeometry: true,
      deleteData: false,
    });
  });
});
