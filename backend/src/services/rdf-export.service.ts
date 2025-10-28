/**
 * RDF Export Service
 * 
 * This service converts OCRA project data to RDF (Resource Description Framework)
 * using standard cultural heritage ontologies:
 * - Dublin Core (DC) - Basic metadata
 * - Dublin Core Terms (DCTERMS) - Extended metadata
 * - CIDOC-CRM - Cultural heritage conceptual reference model
 * 
 * The output is in Turtle format (.ttl) which is human-readable and widely supported.
 */

import { Writer, DataFactory } from 'n3';
import { getPrismaClient } from '../../db.js';
import { getHDTMetadata } from './hdt-metadata.service.js';

const { namedNode, literal } = DataFactory;

// Standard ontology prefixes
const prefixes = {
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  crm: 'http://www.cidoc-crm.org/cidoc-crm/',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  ocra: 'https://ocra.eccch.eu/hdt/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#'
};

/**
 * Export an OCRA project as RDF in Turtle format
 * 
 * @param projectId - The project ID to export
 * @returns Turtle-formatted RDF string
 * @throws Error if project not found
 */
export async function exportProjectAsRDF(projectId: string): Promise<string> {
  const prisma = getPrismaClient();
  
  // Fetch project with manager information
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      projectRoles: {
        where: { role: 'manager' },
        include: { 
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              given_name: true,
              family_name: true
            }
          }
        }
      }
    }
  });
  
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  
  // Fetch HDT metadata from MongoDB (if it exists)
  const hdtMetadata = await getHDTMetadata(projectId);
  
  // Build RDF graph
  return new Promise((resolve, reject) => {
    const writer = new Writer({ 
      prefixes,
      format: 'Turtle' 
    });
    
    // Subject URI for this Heritage Digital Twin
    const projectURI = namedNode(`${prefixes.ocra}${projectId}`);
    
    // ==========================================
    // RDF Type Declarations
    // ==========================================
    
    // Type 1: CIDOC-CRM Information Object
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.rdf}type`),
      namedNode(`${prefixes.crm}E73_Information_Object`)
    );
    
    // Type 2: Heritage Digital Twin (custom OCRA class)
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.rdf}type`),
      namedNode(`${prefixes.ocra}HeritageDigitalTwin`)
    );
    
    // ==========================================
    // Basic Dublin Core Metadata
    // ==========================================
    
    // Title (dc:title and rdfs:label for redundancy)
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dc}title`),
      literal(project.name)
    );
    
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.rdfs}label`),
      literal(project.name)
    );
    
    // Description
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dc}description`),
      literal(project.description)
    );
    
    // ==========================================
    // Creator (Project Manager)
    // ==========================================
    
    if (project.projectRoles.length > 0) {
      const manager = project.projectRoles[0].user;
      
      // Build display name from available fields
      let displayName = manager.name;
      if (!displayName && (manager.given_name || manager.family_name)) {
        displayName = [manager.given_name, manager.family_name]
          .filter(Boolean)
          .join(' ');
      }
      if (!displayName) {
        displayName = manager.email;
      }
      
      writer.addQuad(
        projectURI,
        namedNode(`${prefixes.dc}creator`),
        literal(displayName)
      );
    }
    
    // ==========================================
    // Temporal Information (Dates)
    // ==========================================
    
    // Creation date with XSD dateTime type
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dcterms}created`),
      literal(
        project.createdAt.toISOString(), 
        namedNode(`${prefixes.xsd}dateTime`)
      )
    );
    
    // Last modification date
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dcterms}modified`),
      literal(
        project.updatedAt.toISOString(), 
        namedNode(`${prefixes.xsd}dateTime`)
      )
    );
    
    // ==========================================
    // Access Rights
    // ==========================================
    
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dcterms}accessRights`),
      literal(project.public ? 'public' : 'restricted')
    );
    
    // ==========================================
    // HDT METADATA FROM MONGODB
    // (Enhanced metadata if available)
    // ==========================================
    
    if (hdtMetadata) {
      const { dublinCore, cidocCrm, gettyAAT, license } = hdtMetadata;
      
      // Extended Dublin Core metadata
      if (dublinCore) {
        // Subject / Keywords (can be multiple)
        if (dublinCore.subject && Array.isArray(dublinCore.subject)) {
          dublinCore.subject.forEach(keyword => {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.dc}subject`),
              literal(keyword)
            );
          });
        }
        
        // Type (can be multiple)
        if (dublinCore.type && Array.isArray(dublinCore.type)) {
          dublinCore.type.forEach(type => {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.dc}type`),
              literal(type)
            );
          });
        }
        
        // Language (can be multiple)
        if (dublinCore.language && Array.isArray(dublinCore.language)) {
          dublinCore.language.forEach(lang => {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.dc}language`),
              literal(lang)
            );
          });
        }
        
        // Coverage (spatial or temporal)
        if (dublinCore.coverage) {
          writer.addQuad(
            projectURI,
            namedNode(`${prefixes.dc}coverage`),
            literal(dublinCore.coverage)
          );
        }
        
        // Rights statement
        if (dublinCore.rights) {
          writer.addQuad(
            projectURI,
            namedNode(`${prefixes.dc}rights`),
            literal(dublinCore.rights)
          );
        }
        
        // Source
        if (dublinCore.source) {
          writer.addQuad(
            projectURI,
            namedNode(`${prefixes.dc}source`),
            literal(dublinCore.source)
          );
        }
      }
      
      // CIDOC-CRM metadata
      if (cidocCrm) {
        // Temporal coverage
        if (cidocCrm.temporalCoverage) {
          const temporal = cidocCrm.temporalCoverage;
          
          if (temporal.timeSpanBegin) {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.crm}P82a_begin_of_the_begin`),
              literal(temporal.timeSpanBegin, namedNode(`${prefixes.xsd}dateTime`))
            );
          }
          
          if (temporal.timeSpanEnd) {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.crm}P82b_end_of_the_end`),
              literal(temporal.timeSpanEnd, namedNode(`${prefixes.xsd}dateTime`))
            );
          }
          
          if (temporal.period) {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.dcterms}temporal`),
              literal(temporal.period)
            );
          }
        }
        
        // Spatial coverage
        if (cidocCrm.spatialCoverage) {
          const spatial = cidocCrm.spatialCoverage;
          
          if (spatial.placeName) {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.dcterms}spatial`),
              literal(spatial.placeName)
            );
          }
          
          if (spatial.coordinates) {
            // WGS84 coordinates
            writer.addQuad(
              projectURI,
              namedNode('http://www.w3.org/2003/01/geo/wgs84_pos#lat'),
              literal(spatial.coordinates.latitude.toString(), namedNode(`${prefixes.xsd}decimal`))
            );
            
            writer.addQuad(
              projectURI,
              namedNode('http://www.w3.org/2003/01/geo/wgs84_pos#long'),
              literal(spatial.coordinates.longitude.toString(), namedNode(`${prefixes.xsd}decimal`))
            );
          }
          
          if (spatial.geonames) {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.dcterms}spatial`),
              namedNode(spatial.geonames)
            );
          }
        }
        
        // Materials (with Getty AAT if available)
        if (cidocCrm.material && Array.isArray(cidocCrm.material)) {
          cidocCrm.material.forEach(material => {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.crm}P45_consists_of`),
              literal(material)
            );
          });
        }
        
        // Techniques
        if (cidocCrm.technique && Array.isArray(cidocCrm.technique)) {
          cidocCrm.technique.forEach(technique => {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.crm}P32_used_general_technique`),
              literal(technique)
            );
          });
        }
      }
      
      // Getty AAT controlled vocabulary terms
      if (gettyAAT) {
        // Materials with AAT URIs
        if (gettyAAT.materials && Array.isArray(gettyAAT.materials)) {
          gettyAAT.materials.forEach(mat => {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.crm}P45_consists_of`),
              namedNode(mat.uri)
            );
          });
        }
        
        // Techniques with AAT URIs
        if (gettyAAT.techniques && Array.isArray(gettyAAT.techniques)) {
          gettyAAT.techniques.forEach(tech => {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.crm}P32_used_general_technique`),
              namedNode(tech.uri)
            );
          });
        }
        
        // Object types with AAT URIs
        if (gettyAAT.objectTypes && Array.isArray(gettyAAT.objectTypes)) {
          gettyAAT.objectTypes.forEach(objType => {
            writer.addQuad(
              projectURI,
              namedNode(`${prefixes.dc}type`),
              namedNode(objType.uri)
            );
          });
        }
      }
      
      // License information
      if (license) {
        if (license.licenseUrl) {
          writer.addQuad(
            projectURI,
            namedNode(`${prefixes.dcterms}license`),
            namedNode(license.licenseUrl)
          );
        }
        
        if (license.rightsStatement) {
          writer.addQuad(
            projectURI,
            namedNode(`${prefixes.dcterms}rights`),
            namedNode(license.rightsStatement)
          );
        }
        
        if (license.attribution) {
          writer.addQuad(
            projectURI,
            namedNode('http://creativecommons.org/ns#attributionName'),
            literal(license.attribution)
          );
        }
      }
    }
    
    // ==========================================
    // Publisher (OCRA Platform)
    // ==========================================
    
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dc}publisher`),
      literal('OCRA - Online Conservation-Restoration Annotator')
    );
    
    // ==========================================
    // Format Information
    // ==========================================
    
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dc}format`),
      literal('Heritage Digital Twin')
    );
    
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dcterms}conformsTo`),
      namedNode('http://www.cidoc-crm.org/cidoc-crm/')
    );
    
    // ==========================================
    // Serialize to Turtle format
    // ==========================================
    
    writer.end((error, result) => {
      if (error) {
        reject(new Error(`Failed to serialize RDF: ${error.message}`));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Export project as RDF with format selection
 * 
 * @param projectId - The project ID to export
 * @param format - Output format: 'turtle' | 'ntriples' | 'nquads'
 * @returns RDF string in requested format
 */
export async function exportProjectAsRDFWithFormat(
  projectId: string, 
  format: 'turtle' | 'ntriples' | 'nquads' = 'turtle'
): Promise<string> {
  // For now, only Turtle is supported
  // Future: Add support for other formats
  if (format !== 'turtle') {
    throw new Error(`Format '${format}' not yet supported. Use 'turtle'.`);
  }
  
  return exportProjectAsRDF(projectId);
}
