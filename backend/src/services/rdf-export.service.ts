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
