import { Router } from 'express';
import { 
  getAllVocabularies,
  getVocabularyById,
  createVocabulary,
  updateVocabulary,
  deleteVocabulary
} from '../controllers/vocabularies.controller.js';
import {
  getExternalVocabularyBroader,
  getExternalVocabularyConcept,
  getExternalVocabularyNarrower,
  listExternalVocabularyProviders,
  searchExternalVocabulary,
} from '../controllers/external-vocabularies.controller.js';

const router = Router();

// External vocabulary providers. Keep these routes before the legacy /:vocabularyId route.
router.get('/providers', listExternalVocabularyProviders);
router.get('/:providerId/search', searchExternalVocabulary);
router.get('/:providerId/concepts/:conceptId/broader', getExternalVocabularyBroader);
router.get('/:providerId/concepts/:conceptId/narrower', getExternalVocabularyNarrower);
router.get('/:providerId/concepts/:conceptId', getExternalVocabularyConcept);

// Get all vocabularies
router.get('/', getAllVocabularies);

// Get vocabulary by ID
router.get('/:vocabularyId', getVocabularyById);

// Create new vocabulary (admin only)
router.post('/', createVocabulary);

// Update vocabulary (admin only)
router.put('/:vocabularyId', updateVocabulary);

// Delete vocabulary (admin only)
router.delete('/:vocabularyId', deleteVocabulary);

export default router;
