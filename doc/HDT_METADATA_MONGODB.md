# HDT Metadata Storage Architecture

## Overview

Heritage Digital Twin (HDT) metadata is stored in **MongoDB** for maximum flexibility, allowing easy schema evolution without database migrations. When RDF export is requested, the metadata is dynamically converted from MongoDB documents to RDF triples using cultural heritage ontologies.

## Why MongoDB?

✅ **Schema Flexibility**: No migrations needed when adding new metadata fields  
✅ **Rich Data Structures**: Native support for nested objects and arrays  
✅ **Fast Queries**: Optimized for metadata retrieval and updates  
✅ **Separation of Concerns**: Flexible metadata separate from strict relational project data  
✅ **On-Demand RDF**: Generate RDF only when exporting (not stored redundantly)  

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   PostgreSQL    │         │     MongoDB      │         │   RDF Export    │
│                 │         │                  │         │                 │
│ • Projects      │◄───────►│ • HDT Metadata   │────────►│ • Turtle (.ttl) │
│ • Users         │         │   (flexible)     │         │ • RDF/XML       │
│ • ProjectRoles  │         │                  │         │ • JSON-LD       │
│ • Sessions      │         │                  │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
  Relational                   Document Store              Generated on demand
  (strict schema)              (flexible schema)           (not stored)
```

## Data Model

### MongoDB Collection: `hdt_metadata`

Each document represents HDT metadata for one project:

```typescript
{
  _id: ObjectId,                    // MongoDB ID
  projectId: string,                 // Link to PostgreSQL project
  
  // Dublin Core metadata
  dublinCore: {
    title: string,
    creator: string[],
    subject: string[],               // Keywords/topics
    description: string,
    publisher: string[],
    contributor: string[],
    date: string,                    // ISO 8601
    type: string[],                  // e.g., "3D Model", "Dataset"
    format: string[],
    identifier: string[],
    source: string,
    language: string[],              // ISO 639
    relation: string[],
    coverage: string,
    rights: string
  },
  
  // CIDOC-CRM cultural heritage properties
  cidocCrm: {
    objectType: string,
    temporalCoverage: {
      timeSpanBegin: string,         // ISO 8601
      timeSpanEnd: string,
      period: string,                // e.g., "Renaissance"
      century: string
    },
    spatialCoverage: {
      placeName: string,
      coordinates: {
        latitude: number,
        longitude: number,
        elevation?: number
      },
      geonames: string               // Geonames URI
    },
    material: string[],              // Materials used
    technique: string[],             // Techniques used
    condition: string,
    conservationHistory: string,
    culturalContext: string[],
    styleOrPeriod: string[]
  },
  
  // Getty AAT controlled vocabulary
  gettyAAT: {
    materials: [{
      term: string,                  // "marble"
      aatId: string,                 // "300011443"
      uri: string                    // "http://vocab.getty.edu/aat/300011443"
    }],
    techniques: [{...}],
    objectTypes: [{...}]
  },
  
  // License and rights
  license: {
    licenseType: string,             // "CC-BY-4.0"
    licenseUrl: string,
    rightsStatement: string,         // rightsstatements.org URL
    attribution: string,
    accessRights: "public" | "restricted" | "private",
    useRestrictions: string
  },
  
  // Extensibility
  customMetadata: {},                // For future fields
  
  // Audit
  createdAt: Date,
  updatedAt: Date,
  createdBy: string,                 // User ID
  updatedBy: string
}
```

## API Endpoints

### GET `/api/projects/:projectId/hdt`
Get HDT metadata for a project.

**Response:**
```json
{
  "projectId": "123",
  "dublinCore": {...},
  "cidocCrm": {...},
  "gettyAAT": {...},
  "license": {...}
}
```

### POST `/api/projects/:projectId/hdt`
Create/initialize HDT metadata (automatically initializes with project data).

**Permissions:** Project managers only

**Response:** 201 Created

### PUT `/api/projects/:projectId/hdt`
Update HDT metadata.

**Permissions:** Project managers only

**Request Body:**
```json
{
  "dublinCore": {
    "subject": ["archaeology", "3D scanning"],
    "language": ["en", "it"]
  },
  "cidocCrm": {
    "spatialCoverage": {
      "placeName": "Florence, Italy",
      "coordinates": {
        "latitude": 43.7696,
        "longitude": 11.2558
      }
    }
  }
}
```

### DELETE `/api/projects/:projectId/hdt`
Delete HDT metadata.

**Permissions:** Project managers only

## RDF Export Integration

The RDF export service (`rdf-export.service.ts`) automatically includes HDT metadata when generating RDF:

1. **Fetch** project from PostgreSQL
2. **Fetch** HDT metadata from MongoDB (if exists)
3. **Merge** data and convert to RDF triples
4. **Return** Turtle format (.ttl)

### RDF Ontology Mapping

| MongoDB Field | RDF Predicate | Example |
|--------------|---------------|---------|
| `dublinCore.title` | `dc:title` | "Minerva Statue" |
| `dublinCore.creator` | `dc:creator` | "John Smith" |
| `dublinCore.subject` | `dc:subject` | "archaeology" |
| `cidocCrm.material` | `crm:P45_consists_of` | "marble" |
| `cidocCrm.technique` | `crm:P32_used_general_technique` | "3D scanning" |
| `cidocCrm.temporalCoverage.timeSpanBegin` | `crm:P82a_begin_of_the_begin` | "2024-01-01T00:00:00Z" |
| `cidocCrm.spatialCoverage.coordinates.latitude` | `wgs84:lat` | 43.7696 |
| `gettyAAT.materials[].uri` | `crm:P45_consists_of` | `http://vocab.getty.edu/aat/300011443` |
| `license.licenseUrl` | `dcterms:license` | `https://creativecommons.org/licenses/by/4.0/` |

## Service Layer

### `hdt-metadata.service.ts`

```typescript
// Core operations
getHDTMetadata(projectId): Promise<HDTMetadata | null>
createHDTMetadata(projectId, metadata, userId): Promise<HDTMetadata>
updateHDTMetadata(projectId, metadata, userId): Promise<HDTMetadata | null>
deleteHDTMetadata(projectId): Promise<boolean>

// Utility
initializeHDTMetadata(projectId, projectName, ...): Promise<HDTMetadata>
getProjectsWithHDTMetadata(): Promise<string[]>
```

### `rdf-export.service.ts`

Enhanced to include HDT metadata when exporting:

```typescript
exportProjectAsRDF(projectId): Promise<string>
// - Fetches project from PostgreSQL
// - Fetches HDT metadata from MongoDB
// - Generates RDF triples with all metadata
// - Returns Turtle format
```

## Frontend Integration

### HDT Management Page (`/projects/:id/hdt`)

Form sections:
1. **Dublin Core** - Basic metadata (title, description, keywords, etc.)
2. **Temporal** - Time periods, dates, historical context
3. **Spatial** - Location, coordinates, place names
4. **Cultural Heritage** - Materials, techniques, condition (CIDOC-CRM)
5. **Controlled Vocabularies** - Getty AAT terms with autocomplete
6. **License** - Rights, attribution, license type

## Benefits

1. **Incremental Adoption**: Projects work without HDT metadata, can be added later
2. **Schema Evolution**: Add new fields without database migrations
3. **Performance**: MongoDB optimized for metadata queries
4. **Standard Compliance**: RDF export uses cultural heritage ontologies
5. **Flexibility**: Custom fields supported via `customMetadata`

## Future Enhancements

- [ ] Getty AAT autocomplete API integration
- [ ] Geonames place name lookup
- [ ] Bulk metadata import (CSV, Excel)
- [ ] Metadata validation rules
- [ ] Versioning and history tracking
- [ ] ECCCH Knowledge Base synchronization
- [ ] Multiple RDF formats (RDF/XML, JSON-LD, N-Triples)
- [ ] SPARQL endpoint for querying

## Example RDF Output

```turtle
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix crm: <http://www.cidoc-crm.org/cidoc-crm/> .
@prefix ocra: <https://ocra.eccch.eu/hdt/> .

ocra:123 a crm:E73_Information_Object, ocra:HeritageDigitalTwin ;
  dc:title "Minerva Statue" ;
  dc:subject "archaeology", "Roman period" ;
  dc:language "en", "it" ;
  crm:P45_consists_of <http://vocab.getty.edu/aat/300011443> ; # marble
  crm:P32_used_general_technique "3D laser scanning" ;
  dcterms:spatial "Florence, Italy" ;
  dcterms:temporal "1st century CE" ;
  dcterms:license <https://creativecommons.org/licenses/by/4.0/> .
```

## Files Created

- `backend/src/services/hdt-metadata.service.ts` - MongoDB service layer
- `backend/src/controllers/hdt-metadata.controller.ts` - API handlers
- `backend/src/routes/hdt-metadata.routes.ts` - Express routes
- `backend/src/routes/index.ts` - Route registration (updated)
- `backend/src/services/rdf-export.service.ts` - RDF export (updated)

## MongoDB Indexes

Recommended indexes for performance:

```javascript
db.hdt_metadata.createIndex({ projectId: 1 }, { unique: true })
db.hdt_metadata.createIndex({ updatedAt: -1 })
db.hdt_metadata.createIndex({ "dublinCore.subject": 1 })
db.hdt_metadata.createIndex({ "cidocCrm.spatialCoverage.placeName": 1 })
```
