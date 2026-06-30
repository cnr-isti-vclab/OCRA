// TEMPORARY ECCCH WORKAROUND
// Remove this blacklist as soon as ECCCH exposes a reliable active-registration API/catalogue.
const TEMPORARY_ECCCH_HDT_URI_BLACKLIST = new Set<string>([
  'http://echoes-eccch.eu/HDT/66u7vEPT35z',
]);

export function isTemporarilyBlacklistedEchoesHdtUri(
  digitalTwinUri: string | null | undefined,
): boolean {
  return Boolean(digitalTwinUri && TEMPORARY_ECCCH_HDT_URI_BLACKLIST.has(digitalTwinUri));
}
