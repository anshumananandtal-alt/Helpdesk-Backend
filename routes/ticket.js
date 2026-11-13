import { Router } from 'express';
import multer from 'multer';
import {
    createTicket,
    getAllTickets,
    getTicketById,
    getTicketImage,
    deleteTicketImage,
    updateTicket,
    deleteTicket,
    getTicketAudit,
    getClosedTicketsToCustomer,
} from '../controllers/ticketController.js';
import {
    createComment,
    getCommentsByTicketId,
    updateComment,
    deleteComment,
} from '../controllers/commentController.js';
import { requireAuth } from '../middleware/auth.js';
import { getTicketFileExtension } from '../utils/ticketFileTypes.js';
import { addEditTicket } from '../utils/validation.js';

const router = Router();
const uploadImages = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 5 },
    fileFilter(req, file, callback) {
        if (getTicketFileExtension(file.mimetype)) {
            return callback(null, true);
        }
        return callback(new Error('Only PDF, DOC, DOCX, and supported image files are allowed'));
    },
}).array('image');

router.use(requireAuth);
router.use(uploadImages);
router.get('/', getAllTickets);
router.get('/closed', getClosedTicketsToCustomer);
router.post('/', addEditTicket(), createTicket);
router.get('/:id/images/:imageIndex', getTicketImage);
router.delete('/:id/images/:imageIndex', deleteTicketImage);
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
