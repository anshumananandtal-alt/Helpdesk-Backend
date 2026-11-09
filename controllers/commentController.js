import mongoose from 'mongoose';
import Comment from '../models/comments.js';
import Ticket from '../models/ticket.js';
import AuditTrail from '../models/auditTrail.js';
import { canAccessTicket } from '../utils/ticketAccess.js';

const isStaff = (role) => role === 'agent' || role === 'admin';

const getAccessibleTicket = async (ticketId, req) => {
    if (!mongoose.isValidObjectId(ticketId)) {
        return null;
    }
    const ticket = await Ticket.findById(ticketId);
    if (!ticket || !canAccessTicket(ticket, { id: req.userId, role: req.userRole })) {
        return null;
    }
    return ticket;
};

export const createComment = async (req, res) => {
    try {
        const ticket = await getAccessibleTicket(req.params.ticketId, req);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        if (typeof req.body.text !== 'string' || !req.body.text.trim()) {
            return res.status(400).json({ message: 'Comment text is required' });
        }
        if (req.body.isInternal !== undefined &&
            ![true, false, 'true', 'false'].includes(req.body.isInternal)) {
            return res.status(400).json({ message: 'isInternal must be a boolean' });
        }
        const isInternal = req.body.isInternal === true || req.body.isInternal === 'true';
        if (isInternal && !isStaff(req.userRole)) {
            return res.status(403).json({ message: 'Only agents and admins may add internal notes' });
        }

        const comment = await Comment.create({
            text: req.body.text.trim(),
            author: req.userId,
            ticket: ticket._id,
            isInternal,
        });
        await AuditTrail.create({
            ticket: ticket._id,
            comment: comment._id,
            changedBy: req.userId,
            action: 'comment created',
        });
        res.status(201).json(comment);
    } catch (error) {
        console.error('Error creating comment:', error);
        res.status(500).json({ message: 'Error creating comment' });
    }
};

export const getCommentsByTicketId = async (req, res) => {
    try {
        const ticket = await getAccessibleTicket(req.params.ticketId, req);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        const filter = { ticket: ticket._id };
        if (!isStaff(req.userRole)) {
            filter.isInternal = false;
        }
        const comments = await Comment.find(filter)
            .populate('author', 'name email')
            .sort({ createdAt: 1 });
        res.json(comments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ message: 'Error fetching comments' });
    }
};

const updateOrDeleteComment = async (req, res, operation) => {
    try {
        const ticket = await getAccessibleTicket(req.params.ticketId, req);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        if (!mongoose.isValidObjectId(req.params.commentId)) {
            return res.status(404).json({ message: 'Comment not found' });
        }
        const comment = await Comment.findOne({
            _id: req.params.commentId,
            ticket: ticket._id,
        });
        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }
        if (req.userRole !== 'admin' && comment.author.toString() !== req.userId) {
            return res.status(403).json({ message: 'You may only modify your own comments' });
        }

        if (operation === 'update') {
            if (typeof req.body.text !== 'string' || !req.body.text.trim()) {
                return res.status(400).json({ message: 'Comment text is required' });
            }
            comment.text = req.body.text.trim();
            await comment.save();
        } else {
            await comment.deleteOne();
        }
        await AuditTrail.create({
            ticket: ticket._id,
            comment: comment._id,
            changedBy: req.userId,
            action: operation === 'update' ? 'comment updated' : 'comment deleted',
        });
        res.json(operation === 'update' ? comment : { message: 'Comment deleted successfully' });
    } catch (error) {
        console.error(`Error ${operation} comment:`, error);
        res.status(500).json({ message: `Error ${operation} comment` });
    }
};

export const updateComment = (req, res) => updateOrDeleteComment(req, res, 'update');
export const deleteComment = (req, res) => updateOrDeleteComment(req, res, 'delete');
