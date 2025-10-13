import { Router } from 'express';
import { 
  getAllVocabularies,
  getVocabularyById,
  createVocabulary,
  updateVocabulary,
  deleteVocabulary
} from '../controllers/vocabularies.controller.js';

const router = Router();

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
