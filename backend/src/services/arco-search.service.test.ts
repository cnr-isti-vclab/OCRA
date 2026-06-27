import { describe, expect, it } from 'vitest';
import { buildArcoIndexedBifContains, buildArcoLabelSearchClauses } from './arco-search.service.js';

describe('buildArcoLabelSearchClauses', () => {
  it('uses bif:contains for leading words and substring matching for the trailing partial token', () => {
    expect(buildArcoLabelSearchClauses('allegoria della disperazion')).toEqual([
      {
        bifContains: "'allegoria'",
        trailingContainsNeedle: 'disperazion',
      },
    ]);
  });

  it('uses plain substring matching when there is only one meaningful token', () => {
    expect(buildArcoLabelSearchClauses('disperazion')).toEqual([
      {
        bifContains: null,
        trailingContainsNeedle: 'disperazion',
      },
    ]);
  });

  it('falls back to a normalized substring when only stop words remain', () => {
    expect(buildArcoLabelSearchClauses('della e di')).toEqual([
      {
        bifContains: null,
        trailingContainsNeedle: 'della e di',
      },
    ]);
  });

  it('treats comma-separated fragments as explicit AND groups', () => {
    expect(buildArcoLabelSearchClauses('allegoria della, galassi')).toEqual([
      {
        bifContains: null,
        trailingContainsNeedle: 'allegoria',
      },
      {
        bifContains: null,
        trailingContainsNeedle: 'galassi',
      },
    ]);
  });
});

describe('buildArcoIndexedBifContains', () => {
  it('merges comma-separated groups into one indexed AND expression', () => {
    expect(buildArcoIndexedBifContains('allegoria della, galassi')).toBe("'allegoria AND galassi'");
  });

  it('uses all meaningful words inside a group for the indexed fast path', () => {
    expect(buildArcoIndexedBifContains('allegoria della disperazion')).toBe("'allegoria AND disperazion'");
  });

  it('returns null when there are no meaningful indexed words', () => {
    expect(buildArcoIndexedBifContains('della, e, di')).toBeNull();
  });
});
