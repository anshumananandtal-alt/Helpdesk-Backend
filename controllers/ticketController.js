import Ticket from '../models/Ticket.js';
import AuditTrail from '../models/auditTrail.js';
import { postImage, deleteImage } from '../utils/awsService.js';



export const getAllTickets = async (req, res) => {
    try {
        const tickets = await Ticket.find().populate('creator', 'name email').populate('assignee', 'name email');
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching tickets' });    
    }
};

export const getTicketById = async (req, res) => {  
    try{
        const ticket = await Ticket.findById(req.params.id).populate('creator', 'name email').populate('assignee', 'name email');
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        res.json(ticket);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching ticket' });
    }
};  

export const createTicket = async (req, res) => {
    const { title, description, priority, creator, assignee } = req.body;
    const actorId = req.userId || creator;
    try {
        const files = Array.isArray(req.files)
            ? req.files
            : req.file
                ? [req.file]
                : [];
        const fileNames = await Promise.all(files.map((file) => postImage(file)));
        const newTicket = new Ticket({
            title,
            description,
            priority,
            creator,
            assignee,
            fileName: fileNames
        });
        await newTicket.save();
        await AuditTrail.create({
            ticket: newTicket._id,
            changedBy: actorId,
            action: 'created'
        });
        res.status(201).json(newTicket);
    } catch (error) {
        res.status(500).json({ message: 'Error creating ticket' });
    }
};


export const updateTicket = async (req, res) => {
    const { title, description, priority, status, assignee, version } = req.body;
    const actorId = req.userId;
    const expectedVersion = Number(version);
    let uploadedFileNames = [];
    let updateSucceeded = false;
    try {
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
            return res.status(400).json({
                message: 'A valid ticket version is required'
            });
        }

        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }
        // Check if the actor is the creator or assignee of the ticket
        if (ticket.creator.toString() !== actorId &&
            ticket.assignee?.toString() !== actorId) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const files = Array.isArray(req.files) ? req.files : [];
        uploadedFileNames = files.length > 0
            ? await Promise.all(files.map((file) => postImage(file)))
            : [];
        const hasUploadedFiles = files.length > 0;
        const oldFileNames = ticket.fileName ?? [];
        const hasFileUpdate = hasUploadedFiles ||
            Object.prototype.hasOwnProperty.call(req.body, 'existingFileNames');
        let fileNames;

        if (hasFileUpdate) {
            const existingFileNames = parseFileList(req.body.existingFileNames);
            const retainedFileNames = existingFileNames.filter((fileName) =>
                oldFileNames.includes(fileName)
            );
            const newFileNames = uploadedFileNames ?? [];
            const fileOrder = parseFileList(req.body.fileOrder);

            fileNames = fileOrder.length > 0
                ? buildFileOrder(fileOrder, retainedFileNames, newFileNames)
                : [...retainedFileNames, ...newFileNames];
        }

        const changes = {
            title,
            description,
            priority,
            status,
            assignee,
            fileName: fileNames,
        };
        const updatedTicket = await Ticket.updateWithAudit(
            req.params.id,
            changes,
            actorId,
            expectedVersion
        );
        updateSucceeded = true;

        if (hasFileUpdate) {
            for (const fileName of oldFileNames) {
                if (!fileNames.includes(fileName)) {
                    await deleteImage(fileName);
                }
            }
        }

        res.json(updatedTicket);
    } catch (error) {
        if (!updateSucceeded && uploadedFileNames.length > 0) {
            await Promise.all(uploadedFileNames.map((fileName) => deleteImage(fileName)));
        }
        if (error.code === 'VERSION_CONFLICT') {
            return res.status(409).json({
                message: 'Ticket was updated by another user. Refresh and try again.'
            });
        }
        res.status(500).json({ message: 'Error updating ticket' });
    }
};

const parseFileList = (value) => {
    if (value === undefined) {
        return [];
    }
    if (Array.isArray(value)) {
        return value;
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
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
        ...orderedFileNames,
        ...newFileNames.filter((fileName) => !orderedFileNames.includes(fileName)),
        ...retainedFileNames.filter((fileName) => !orderedFileNames.includes(fileName))
    ];
};


export const deleteTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found' });
        }   
        // Check if the actor is the creator or assignee of the ticket
        if (ticket.creator.toString() !== req.userId &&
            ticket.assignee?.toString() !== req.userId) {
            return res.status(403).json({ message: 'Access denied' });
        }       

        await ticket.deleteOne();
        // Delete all associated images from S3.
        for (const fileName of ticket.fileName ?? []) {
            await deleteImage(fileName);
        }
        await AuditTrail.create({
            ticket: ticket._id,
            changedBy: req.userId,
            action: 'deleted'
        });
        res.json({ message: 'Ticket deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting ticket' });
    }   
};
