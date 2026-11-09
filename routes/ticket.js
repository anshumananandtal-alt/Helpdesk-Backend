import { Router } from 'express';
import multer from 'multer';
import {
    createTicket,
    getAllTickets,
    getTicketById,
    updateTicket,
    deleteTicket,
    getTicketAudit,
} from '../controllers/ticketController.js';
import {
    createComment,
    getCommentsByTicketId,
    updateComment,
    deleteComment,
} from '../controllers/commentController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const uploadImages = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 5 },
    fileFilter(req, file, callback) {
        if (['image/png', 'image/jpeg'].includes(file.mimetype)) {
            return callback(null, true);
        }
        return callback(new Error('Only PNG and JPEG images are supported'));
    },
}).array('image');

router.use(requireAuth);
router.use(uploadImages);
router.get('/', getAllTickets);
router.post('/', createTicket);
router.get('/:id/audit', getTicketAudit);
router.get('/:id/comments', (req, res, next) => {
    req.params.ticketId = req.params.id;
    next();
}, getCommentsByTicketId);
router.post('/:id/comments', (req, res, next) => {
    req.params.ticketId = req.params.id;
    next();
}, createComment);
router.put('/:id/comments/:commentId', (req, res, next) => {
    req.params.ticketId = req.params.id;
    next();
}, updateComment);
router.delete('/:id/comments/:commentId', (req, res, next) => {
    req.params.ticketId = req.params.id;
    next();
}, deleteComment);
router.get('/:id', getTicketById);
router.patch('/:id', updateTicket);
router.put('/:id', updateTicket);
router.delete('/:id', deleteTicket);

export default router;
