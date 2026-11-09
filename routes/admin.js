import { Router } from 'express';
import { getDashboard } from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/dashboard', requireAdmin, getDashboard);

export default router;