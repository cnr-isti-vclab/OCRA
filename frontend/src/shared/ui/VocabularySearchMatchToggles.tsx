import './VocabularySearchMatchToggles.css';

interface VocabularySearchMatchTogglesProps {
  wholeWords: boolean;
  caseSensitive: boolean;
  onWholeWordsChange: (enabled: boolean) => void;
  onCaseSensitiveChange: (enabled: boolean) => void;
}

export default function VocabularySearchMatchToggles({
  wholeWords,
  caseSensitive,
  onWholeWordsChange,
  onCaseSensitiveChange,
}: VocabularySearchMatchTogglesProps) {
  return (
    <>
      <button
        type="button"
        className={`btn btn-outline-secondary vocabulary-search-toggle ${caseSensitive ? 'active' : ''}`}
        aria-label="Match case"
        aria-pressed={caseSensitive}
        title="Match case"
        onClick={() => onCaseSensitiveChange(!caseSensitive)}
      >
        <span aria-hidden>Aa</span>
      </button>
      <button
        type="button"
        className={`btn btn-outline-secondary vocabulary-search-toggle ${wholeWords ? 'active' : ''}`}
        aria-label="Match whole word(s)"
        aria-pressed={wholeWords}
        title="Match whole word(s)"
        onClick={() => onWholeWordsChange(!wholeWords)}
      >
        <span className="vocabulary-search-toggle__whole-word" aria-hidden>ab</span>
      </button>
    </>
  );
}
