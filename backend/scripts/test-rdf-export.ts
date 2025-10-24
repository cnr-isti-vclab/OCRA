/**
 * Test script for N3 RDF library
 * 
 * This script demonstrates basic RDF generation using N3.js
 * It creates a simple Heritage Digital Twin description using Dublin Core metadata
 * and exports it to Turtle format.
 * 
 * Run: npx tsx scripts/test-rdf-export.ts
 */

import { Writer, DataFactory } from 'n3';

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

function generateSampleRDF(): Promise<string> {
  return new Promise((resolve, reject) => {
    // Create a new RDF writer with Turtle format
    const writer = new Writer({ 
      prefixes,
      format: 'Turtle' 
    });
    
    // Sample project data (simulating OCRA project)
    const projectId = 'test-project-001';
    const projectURI = namedNode(`${prefixes.ocra}${projectId}`);
    
    // Add RDF Type: This is a CIDOC-CRM Information Object
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.rdf}type`),
      namedNode(`${prefixes.crm}E73_Information_Object`)
    );
    
    // Add another type: Heritage Digital Twin
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.rdf}type`),
      namedNode(`${prefixes.ocra}HeritageDigitalTwin`)
    );
    
    // Dublin Core: Title
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dc}title`),
      literal('Test Conservation Project: Bernini Angel')
    );
    
    // Dublin Core: Description
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dc}description`),
      literal('High-resolution 3D documentation and conservation monitoring of a Baroque marble sculpture')
    );
    
    // Dublin Core: Creator
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dc}creator`),
      literal('ISTI-CNR Conservation Lab')
    );
    
    // Dublin Core Terms: Created date (with XSD datatype)
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dcterms}created`),
      literal('2024-01-15T09:00:00.000Z', namedNode(`${prefixes.xsd}dateTime`))
    );
    
    // Dublin Core Terms: Modified date
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dcterms}modified`),
      literal('2024-10-24T10:00:00.000Z', namedNode(`${prefixes.xsd}dateTime`))
    );
    
    // Dublin Core Terms: Access Rights
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.dcterms}accessRights`),
      literal('restricted')
    );
    
    // RDFS: Label (human-readable name)
    writer.addQuad(
      projectURI,
      namedNode(`${prefixes.rdfs}label`),
      literal('Test Conservation Project: Bernini Angel')
    );
    
    // Serialize to Turtle format
    writer.end((error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

// Main execution
async function main() {
  try {
    console.log('🧪 Testing N3 RDF Library...\n');
    console.log('━'.repeat(60));
    console.log('Generating sample RDF for Heritage Digital Twin');
    console.log('━'.repeat(60));
    console.log();
    
    const rdfOutput = await generateSampleRDF();
    
    console.log('📄 Generated RDF (Turtle format):\n');
    console.log(rdfOutput);
    console.log();
    console.log('━'.repeat(60));
    console.log('✅ Success! N3 library is working correctly.');
    console.log('━'.repeat(60));
    console.log();
    console.log('Next steps:');
    console.log('  1. ✅ N3 library installed and verified');
    console.log('  2. ⏭️  Create RDF export service for real OCRA projects');
    console.log('  3. ⏭️  Add API endpoint for RDF export');
    console.log();
    
  } catch (error) {
    console.error('❌ Error generating RDF:', error);
    process.exit(1);
  }
}

main();
