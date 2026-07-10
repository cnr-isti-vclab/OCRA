export const ECHOES_HDTO_NAMESPACE = 'http://isl.ics.forth.gr/ontology/echoes/';

/**
 * OCRA profile used for named graphs whose HDTO assertions follow HDTO v1.1.
 * Legacy graphs have no profile marker and used HP3 for asset membership.
 */
export const OCRA_HDTO_V1_1_RDF_PROFILE = 'https://data.ocra.echoes.eu/rdf-profile/hdto-v1.1-ocra-v1';
export const OCRA_RDF_PROFILE_PREDICATE = 'ocra:rdfProfile';

export const ECHOES_HDTO_CLASS_HC1_HERITAGE_ENTITY = `${ECHOES_HDTO_NAMESPACE}HC1_Heritage_Entity`;
export const ECHOES_HDTO_CLASS_HC2_HERITAGE_DIGITAL_TWIN = `${ECHOES_HDTO_NAMESPACE}HC2_Heritage_Digital_Twin`;
export const ECHOES_HDTO_CLASS_HC8_3D_MODEL = `${ECHOES_HDTO_NAMESPACE}HC8_3D_Model`;

export const ECHOES_HDTO_PROPERTY_HP1_HAS_DIGITAL_TWIN = `${ECHOES_HDTO_NAMESPACE}HP1_has_digital_twin`;
export const ECHOES_HDTO_PROPERTY_HP3_IS_DIGITAL_TWIN_COMPONENT_OF = `${ECHOES_HDTO_NAMESPACE}HP3_is_digital_twin_component_of`;
export const ECHOES_HDTO_PROPERTY_HP21_IS_3D_REPRESENTATION_OUTPUT_OF = `${ECHOES_HDTO_NAMESPACE}HP21_is_3D_representation_output_of`;

export const ECHOES_HDTO_CURIE_HC1_HERITAGE_ENTITY = 'hdto:HC1_Heritage_Entity';
export const ECHOES_HDTO_CURIE_HC2_HERITAGE_DIGITAL_TWIN = 'hdto:HC2_Heritage_Digital_Twin';
export const ECHOES_HDTO_CURIE_HC8_3D_MODEL = 'hdto:HC8_3D_Model';

export const ECHOES_HDTO_CURIE_HP1_HAS_DIGITAL_TWIN = 'hdto:HP1_has_digital_twin';
export const ECHOES_HDTO_CURIE_HP3_IS_DIGITAL_TWIN_COMPONENT_OF = 'hdto:HP3_is_digital_twin_component_of';
export const ECHOES_HDTO_CURIE_HP21_IS_3D_REPRESENTATION_OUTPUT_OF = 'hdto:HP21_is_3D_representation_output_of';
