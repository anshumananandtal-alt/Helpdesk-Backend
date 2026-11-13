import mongoose from 'mongoose';
import Ticket from '../models/ticket.js';
import AuditTrail from '../models/auditTrail.js';
import User from '../models/user.js';
import { postImage, getImage, deleteImage } from '../utils/awsService.js';
import { STATUS_TRANSITIONS, getAllowedNextStatuses } from '../utils/ticketRules.js';
import { getBreachedFilter, getTicketSlaDeadline, isTicketBreached } from '../utils/sla.js';
import { canAccessTicket } from '../utils/ticketAccess.js';
import emailService from '../utils/emailService.js';
import { validationResult } from 'express-validator';

const validPriorities = ['low', 'medium', 'high', 'urgent'];

const addSlaState = (ticket) => {
    const result = ticket.toObject ? ticket.toObject() : { ...ticket };
    let deadline = getTicketSlaDeadline(result);
    if (deadline) {
        result.slaDeadline = deadline;
    }
    if (deadline && result.status === 'waiting_on_customer' && result.slaPausedAt) {
        deadline = new Date(
            new Date(deadline).getTime() + Date.now() - new Date(result.slaPausedAt).getTime()
        );
        result.slaDeadline = deadline;
    }
    result.breached = isTicketBreached(result);
    delete result.slaDueAt;
    delete result.slaPausedAt;
    return result;
};

const getTicketForUser = async (id, req) => {
    if (!mongoose.isValidObjectId(id)) {
        return null;
    }
    const ticket = await Ticket.findById(id)
        .select('+slaDueAt +slaPausedAt')
        .populate('creator', 'name email')
        .populate('assignee', 'name email')
        .populate('relatedTo');
    return ticket && canAccessTicket(ticket, { id: req.userId, role: req.userRole })
        ? ticket
        : null;
};

export const getClosedTicketsToCustomer = async (req, res) => {
    try {
        const tickets = await Ticket.find({
            creator: req.userId,
            status: 'closed',
        })
            .select('+slaDueAt +slaPausedAt')
            .populate('creator', 'name email')
            .populate('assignee', 'name email')
            .populate('relatedTo')
            .sort({ updatedAt: -1 });
        res.json(tickets.map(addSlaState));
    }
    catch (error) {
        console.error('Error fetching closed tickets:', error);
        res.status(500).json({ message: 'Error fetching closed tickets' });
    }
};

export const getAllTickets = async (req, res) => {
    try {
        const page = Number.parseInt(req.query.page, 10) || 1;
        const limit = Number.parseInt(req.query.limit, 10) || 20;
        if (page < 1 || limit < 1 || limit > 100) {
            return res.status(400).json({ message: 'page must be positive and limit must be between 1 and 100' });
        }

        const filter = {};
        if (req.userRole === 'customer') {
            filter.creator = req.userId;
        } else if (req.query.assignee) {
            if (!mongoose.isValidObjectId(req.query.assignee)) {
                return res.status(400).json({ message: 'Invalid assignee ID' });
            }
            filter.assignee = req.query.assignee;
        }

        if (req.query.status) {
            if (!Object.hasOwn(STATUS_TRANSITIONS, req.query.status)) {
                return res.status(400).json({ message: 'Invalid ticket status' });
            }
            filter.status = req.query.status;
        }
        if (req.query.priority) {
            if (!validPriorities.includes(req.query.priority)) {
                return res.status(400).json({ message: 'Invalid ticket priority' });
            }
            filter.priority = req.query.priority;
        }
        if (req.query.search) {
            const search = String(req.query.search).trim().slice(0, 100);
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [
                { title: { $regex: escapedSearch, $options: 'i' } },
            ];
        }
        if (req.query.breached !== undefined) {
            if (!['true', 'false'].includes(req.query.breached)) {
                return res.status(400).json({ message: 'breached must be true or false' });
            }
            const now = new Date();
            filter.$and = [
                ...(filter.$and ?? []),
                getBreachedFilter(req.query.breached === 'true', now),
            ];
        }

        const [tickets, total] = await Promise.all([
            Ticket.find(filter)
                .select('+slaDueAt +slaPausedAt')
                .populate('creator', 'name email')
                .populate('assignee', 'name email')
                .populate('relatedTo')
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
            Ticket.countDocuments(filter),
        ]);
        res.json({
            tickets: tickets.map(addSlaState),
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ message: 'Error fetching tickets' });
    }
};

export const getTicketById = async (req, res) => {
    try {
        const ticket = await getTicketForUser(req.params.id, req);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        res.json(addSlaState(ticket));
    } catch (error) {
        console.error('Error fetching ticket:', error);
        res.status(500).json({ message: 'Error fetching ticket' });
    }
};

export const getTicketImage = async (req, res) => {
    try {
        const imageIndex = Number(req.params.imageIndex);
        if (!mongoose.isValidObjectId(req.params.id) ||
            !Number.isInteger(imageIndex) ||
            imageIndex < 0) {
            return res.status(404).json({ message: 'Ticket image not found' });
        }

        const ticket = await getTicketForUser(req.params.id, req);
        const imageKey = ticket?.fileName?.[imageIndex];
        if (!imageKey) {
            return res.status(404).json({ message: 'Ticket image not found' });
        }

        const image = await getImage(imageKey);
        if (!image.Body) {
            throw new Error('Ticket image has no response body');
        }
        const imageBytes = await image.Body.transformToByteArray();
        res.set('Content-Type', image.ContentType || 'application/octet-stream');
        res.set('Cache-Control', 'private, no-store');
        res.set('X-Content-Type-Options', 'nosniff');
        res.send(Buffer.from(imageBytes));
    } catch (error) {
        if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
            return res.status(404).json({ message: 'Ticket image not found' });
        }
        console.error('Error fetching ticket image:', error);
        res.status(500).json({ message: 'Error fetching ticket image' });
    }
};

export const deleteTicketImage = async (req, res) => {
    try {
        const imageIndex = Number(req.params.imageIndex);
        if (!mongoose.isValidObjectId(req.params.id) ||
            !Number.isInteger(imageIndex) ||
            imageIndex < 0) {
            return res.status(404).json({ message: 'Ticket image not found' });
        }

        const ticket = await getTicketForUser(req.params.id, req);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket image not found' });
        }
        const imageKey = ticket.fileName?.[imageIndex];
        if (!imageKey) {
            return res.status(404).json({ message: 'Ticket image not found' });
        }
        if (ticket.status === 'closed') {
            return res.status(409).json({ message: 'Attachments cannot be changed on a closed ticket' });
        }

        const remainingFileNames = ticket.fileName.filter((_, index) => index !== imageIndex);
        const updatedTicket = await Ticket.updateWithAudit(
            ticket._id,
            { fileName: remainingFileNames },
            req.userId,
            ticket.version
        );
        if (!updatedTicket.fileName.includes(imageKey)) {
            await deleteImage(imageKey);
        }

        res.json({
            message: 'Ticket image deleted successfully',
            version: updatedTicket.version,
        });
    } catch (error) {
        if (error.code === 'VERSION_CONFLICT') {
            return res.status(409).json({
                message: 'This ticket was updated by someone else. Refresh and try again.',
                code: 'VERSION_CONFLICT',
            });
        }
        console.error('Error deleting ticket image:', error);
        res.status(500).json({ message: 'Error deleting ticket image' });
    }
};

export const createTicket = async (req, res) => {
    let uploadedFileNames = [];
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(422).json({ errors: errors.array() });
    }
    try {
        const files = Array.isArray(req.files) ? req.files : [];
        for (const file of files) {
            uploadedFileNames.push(await postImage(file));
        }
        const relatedTo = req.body.relatedTo;
        if (relatedTo !== undefined && relatedTo !== null && relatedTo !== '') {
            if (!mongoose.isValidObjectId(relatedTo)) {
                return res.status(400).json({ message: 'Invalid related ticket ID' });
            }
            const isTicketAlreadyRelated = await Ticket.findOne({ relatedTo: relatedTo });
            const relatedTicket = await Ticket.findById(relatedTo).select('_id');
            if( isTicketAlreadyRelated) {
                return res.status(409).json({ message: 'This ticket is already related to another ticket' });
            }
            if (!relatedTicket) {
                return res.status(404).json({ message: 'Related ticket not found' });
            }
        }

        const ticket = new Ticket({
            title: req.body.title,
            description: req.body.description,
            category: req.body.category,
            priority: req.body.priority,
            creator: req.userId,
            relatedTo: relatedTo || undefined,
            fileName: uploadedFileNames,
        });
        await ticket.save();
        await AuditTrail.create({
            ticket: ticket._id,
            changedBy: req.userId,
            action: 'created',
        });
        res.status(201).json(addSlaState(ticket));
    } catch (error) {
        if (uploadedFileNames.length > 0) {
            await Promise.all(uploadedFileNames.map((fileName) => deleteImage(fileName)));
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        console.error('Error creating ticket:', error);
        res.status(500).json({ message: 'Error creating ticket' });
    }
};

export const updateTicket = async (req, res) => {
    let uploadedFileNames = [];
    let updateSucceeded = false;
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        const expectedVersion = Number(req.body.version);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
            return res.status(400).json({ message: 'A valid ticket version is required' });
        }

        const ticket = await Ticket.findById(req.params.id).select('+slaDueAt +slaPausedAt');
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        if (!canAccessTicket(ticket, { id: req.userId, role: req.userRole })) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const requestedFields = ['title', 'description', 'category', 'priority', 'status', 'assignee', 'relatedTo'];
        const changes = Object.fromEntries(
            requestedFields
                .filter((field) => Object.hasOwn(req.body, field))
                .map((field) => [field, req.body[field]])
        );
        if (Object.hasOwn(changes, 'relatedTo')) {
            const relatedTo = changes.relatedTo;
            if (relatedTo === null || relatedTo === '' || relatedTo === undefined) {
                changes.relatedTo = null;
            } else {
                if (!mongoose.isValidObjectId(relatedTo)) {
                    return res.status(400).json({ message: 'Invalid related ticket ID' });
                }
                const relatedTicket = await Ticket.findById(relatedTo).select('_id');
                if (!relatedTicket) {
                    return res.status(404).json({ message: 'Related ticket not found' });
                }
                changes.relatedTo = relatedTo;
            }
        }
        const files = Array.isArray(req.files) ? req.files : [];
        let assignedUser;

        if (ticket.status === 'closed' && files.length > 0) {
            return res.status(409).json({ message: 'Attachments cannot be added to a closed ticket' });
        }

        if (req.userRole === 'customer') {
            const fields = Object.keys(changes);
            const isWaitingOnCustomer = ticket.status === 'waiting_on_customer';
            const isResolvedStatusChange = ticket.status === 'resolved' &&
                fields.length === 1 && fields[0] === 'status' &&
                ['closed', 'reopened'].includes(changes.status);
            const isWaitingUpdate = isWaitingOnCustomer &&
                fields.every((field) => field === 'status') &&
                (!Object.hasOwn(changes, 'status') || changes.status === 'in_progress') &&
                !Object.hasOwn(req.body, 'fileOrder');
            if (!isResolvedStatusChange && !isWaitingUpdate) {
                return res.status(403).json({
                    message: 'Customers may only respond to waiting tickets or close/reopen their resolved tickets',
                });
            }
            if (!isWaitingOnCustomer && files.length > 0) {
                return res.status(403).json({ message: 'Customers may upload files only while a ticket is waiting on them' });
            }
        } else {
            if (Object.hasOwn(changes, 'assignee') && changes.assignee !== null) {
                if (!mongoose.isValidObjectId(changes.assignee)) {
                    return res.status(400).json({ message: 'Invalid assignee ID' });
                }
                assignedUser = await User.findOne({
                    _id: changes.assignee,
                    role: { $in: ['agent', 'admin'] },
                    isActive: true,
                }).select('name email');
                if (!assignedUser) {
                    return res.status(400).json({ message: 'Assignee must be an active agent or admin' });
                }
            }
            if (req.userRole === 'agent' && Object.hasOwn(changes, 'assignee') &&
                String(changes.assignee ?? '') !== req.userId) {
                return res.status(403).json({ message: 'Agents may only assign tickets to themselves' });
            }
        }

        if (changes.status && changes.status !== ticket.status) {
            if (!STATUS_TRANSITIONS[ticket.status]?.includes(changes.status)) {
                return res.status(422).json({
                    message: `Invalid status transition: ${ticket.status} -> ${changes.status}`,
                    code: 'INVALID_STATUS_TRANSITION',
                });
            }
            if (!getAllowedNextStatuses(ticket, { id: req.userId, role: req.userRole })
                .includes(changes.status)) {
                return res.status(403).json({ message: 'You are not allowed to perform this status transition' });
            }
        }

        for (const file of files) {
            uploadedFileNames.push(await postImage(file));
        }
        const oldFileNames = ticket.fileName ?? [];
        if (req.userRole === 'customer' && files.length > 0) {
            changes.fileName = [...oldFileNames, ...uploadedFileNames];
        } else if (files.length > 0 || Object.hasOwn(req.body, 'fileOrder')) {
            const fileOrder = parseFileList(req.body.fileOrder);
            changes.fileName = fileOrder.length
                ? buildFileOrder(fileOrder, oldFileNames, uploadedFileNames)
                : [...oldFileNames, ...uploadedFileNames];
        }

        const updatedTicket = await Ticket.updateWithAudit(
            req.params.id,
            changes,
            req.userId,
            expectedVersion
        );
        updateSucceeded = true;

        if (assignedUser && String(ticket.assignee ?? '') !== String(assignedUser._id)) {
            try {
                await emailService.sendEmail({
                    to: assignedUser.email,
                    subject: 'A helpdesk ticket has been assigned to you',
                    text: `Hello ${assignedUser.name},\n\nTicket "${updatedTicket.title}" has been assigned to you.\nTicket ID: ${updatedTicket._id}`,
                });
            } catch (emailError) {
                console.error('Error sending ticket assignment email:', emailError);
            }
        }

        const populatedTicket = await Ticket.findById(updatedTicket._id)
            .select('+slaDueAt +slaPausedAt')
            .populate('creator', 'name email')
            .populate('assignee', 'name email')
            .populate('relatedTo');
        res.json(addSlaState(populatedTicket));
    } catch (error) {
        if (!updateSucceeded && uploadedFileNames.length > 0) {
            await Promise.all(uploadedFileNames.map((fileName) => deleteImage(fileName)));
        }
        if (error.code === 'VERSION_CONFLICT') {
            return res.status(409).json({
                message: 'This ticket was updated by someone else. Refresh and try again.',
                code: 'VERSION_CONFLICT',
            });
        }
        if (error.code === 'INVALID_STATUS_TRANSITION') {
            return res.status(422).json({ message: error.message, code: error.code });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: error.message });
        }
        console.error('Error updating ticket:', error);
        res.status(500).json({ message: 'Error updating ticket' });
    }
};

const parseFileList = (value) => {
    if (value === undefined) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.filter((item) => typeof item === 'string');
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter((item) => typeof item === 'string')
            : [value];
    } catch {
        return [value];
    }
};

const buildFileOrder = (order, retainedFileNames, newFileNames) => {
    const orderedFileNames = [];
    for (const item of order) {
        if (item.startsWith('new:')) {
            const index = Number(item.slice(4));
            if (Number.isInteger(index) && newFileNames[index]) {
                orderedFileNames.push(newFileNames[index]);
            }
        } else if (item.startsWith('existing:')) {
            const fileName = item.slice(9);
            if (retainedFileNames.includes(fileName)) {
                orderedFileNames.push(fileName);
            }
        }
    }
    return [
        ...new Set(orderedFileNames),
        ...newFileNames.filter((fileName) => !orderedFileNames.includes(fileName)),
        ...retainedFileNames.filter((fileName) => !orderedFileNames.includes(fileName)),
    ];
};

export const deleteTicket = async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({ message: 'Only admins may delete tickets' });
        }
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        await ticket.deleteOne();
        await Promise.all((ticket.fileName ?? []).map((fileName) => deleteImage(fileName)));
        await AuditTrail.create({
            ticket: ticket._id,
            changedBy: req.userId,
            action: 'deleted',
        });
        res.json({ message: 'Ticket deleted successfully' });
    } catch (error) {
        console.error('Error deleting ticket:', error);
        res.status(500).json({ message: 'Error deleting ticket' });
    }
};

export const getTicketAudit = async (req, res) => {
    try {
        const ticket = await getTicketForUser(req.params.id, req);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        if (req.userRole === 'customer') {
            return res.status(403).json({ message: 'Audit history is available to staff only' });
        }
        const audit = await AuditTrail.find({ ticket: ticket._id })
            .populate('changedBy', 'name email')
            .sort({ createdAt: 1 });
        res.json(audit);
    } catch (error) {
        console.error('Error fetching ticket audit:', error);
        res.status(500).json({ message: 'Error fetching ticket audit' });
    }
};
