This folder contains samples of metadata returned by external sources.

### ARCO
`arco.txt` Contain metadata fetched from: 

`https://dati.cultura.gov.it/lodview-arco/resource/HistoricOrArtisticProperty/0901078520.html?output=application%2Fld%2Bjson`

e.g. for testing the ARCO adapter implementation (that corresponds to the object with id `0901078520` in ARCO).

### Wikidata / Reasonator
Wikidata imports can be triggered with a QID or with a Reasonator URL, for example:

`https://reasonator.toolforge.org/?q=Q24628970`

The backend resolves the QID and fetches data from:

`https://www.wikidata.org/wiki/Special:EntityData/Q24628970.json`
