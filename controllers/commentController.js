import comments from "../models/comments.js";
import AuditTrail from "../models/auditTrail.js";

export const createComment = async (req, res) => {
    const { text, author } = req.body;
    const { ticketId } = req.params;
    
    try {
        const newComment = new comments({
            text,
            author,
            ticket: ticketId
        });
        await newComment.save();
        await AuditTrail.create({
            comment: newComment._id,
            changedBy: req.userId || author,
            action: 'comment created'
        });
        res.status(201).json(newComment);
    }  catch (error) {
        res.status(500).json({ message: 'Error creating comment' });
    }   
};

export const getCommentsByTicketId = async (req, res) => {
    const { ticketId } = req.params;
    try {
        const commentsList = await comments.find({ ticket: ticketId }).populate('author', 'name email');
        res.json(commentsList);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching comments' });
    }
};

export const updateComment = async (req, res) => {
    const { commentId } = req.params;
    const { text } = req.body;
    try {
        const comment = await comments.findById(commentId);
        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }   
        comment.text = text;
        await comment.save();
        await AuditTrail.create({
            comment: comment._id,
            changedBy: req.userId || comment.author,
            action: 'comment updated'
        });
        const updatedComment = comment;
        res.json(updatedComment);
    } catch (error) {
        res.status(500).json({ message: 'Error updating comment' });
    }   
};

export const deleteComment = async (req, res) => {  
    const { commentId } = req.params;
    try {
        const comment = await comments.findById(commentId);
        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }
        await comment.deleteOne();
        await AuditTrail.create({
            comment: comment._id,
            changedBy: req.userId || comment.author,
            action: 'comment deleted'
        });
        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting comment' });
    }   
};