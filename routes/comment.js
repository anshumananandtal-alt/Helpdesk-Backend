import { Router } from 'express';
import {
    createComment,
    getCommentsByTicketId,
    updateComment,
    deleteComment,
} from '../controllers/commentController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.post('/tickets/:ticketId/comments', createComment);
router.get('/tickets/:ticketId/comments', getCommentsByTicketId);
router.put('/tickets/:ticketId/comments/:commentId', updateComment);
router.delete('/tickets/:ticketId/comments/:commentId', deleteComment);

export default router;
