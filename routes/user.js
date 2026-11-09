import { Router } from 'express';
import {
    getUser,
    getUsers,
    updateUser,
    deleteUser,
} from '../controllers/userController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), getUsers);
router.get('/:id', requireAuth, getUser);
router.patch('/:id', requireAuth, requireRole('admin'), updateUser);
router.put('/:id', requireAuth, requireRole('admin'), updateUser);
router.delete('/:id', requireAuth, requireRole('admin'), deleteUser);

export default router;
