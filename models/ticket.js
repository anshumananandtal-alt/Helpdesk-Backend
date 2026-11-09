import mongoose from "mongoose";
import AuditTrail from "./auditTrail.js";

const auditableFields = ['status', 'assignee', 'priority'];

const ticketSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true  
    },
    description: {  
        type: String,
        required: true
    }, 
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'low'  
    },
    status: {
        type: String,
        enum: ['open', 'in progress', 'resolved', 'closed'],    
        default: 'open'
    },
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true  
    },
    assignee: {
        type: mongoose.Schema.Types.ObjectId,       
        ref: 'User'
    },
    fileName: [{
        type: String
    }],
    resolvedAt: {
        type: Date
    },
    slaDueAt: {
        type: Date
    },
    breached: {
        type: Boolean,
        default: false
    },
    version: {
        type: Number,
        default: 1  
    },  
}, { timestamps: true });

ticketSchema.statics.updateWithAudit = async function (
    ticketId,
    changes,
    actorId,
    expectedVersion
) {
    if (!actorId) {
        throw new Error('An actor is required to update a ticket');
    }
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw new Error('A valid expected ticket version is required');
    }

    const ticket = await this.findOne({ _id: ticketId, version: expectedVersion });
    if (!ticket) {
        const error = new Error('Ticket was updated by another user');
        error.code = 'VERSION_CONFLICT';
        throw error;
    }

    const definedChanges = Object.fromEntries(
        Object.entries(changes).filter(([, value]) => value !== undefined)
    );
    const changesToAudit = [];
    for (const field of auditableFields) {
        if (Object.prototype.hasOwnProperty.call(definedChanges, field) &&
            String(ticket[field] ?? '') !== String(definedChanges[field] ?? '')) {
            changesToAudit.push({
                ticket: ticket._id,
                changedBy: actorId,
                action: `${field} changed`,
                field,
                oldValue: ticket[field] ?? null,
                newValue: definedChanges[field] ?? null
            });
        }
    }

    const hasChanges = Object.keys(definedChanges).some(
        (field) => String(ticket[field] ?? '') !== String(definedChanges[field] ?? '')
    );
    if (!hasChanges) {
        return ticket;
    }

    const update = {
        $set: { ...definedChanges },
        $inc: { version: 1 }
    };
    if (definedChanges.status &&
        ['resolved', 'closed'].includes(definedChanges.status) &&
        !ticket.resolvedAt) {
        update.$set.resolvedAt = new Date();
    }
    const updatedTicket = await this.findOneAndUpdate(
        { _id: ticketId, version: expectedVersion },
        update,
        { new: true, runValidators: true }
    );
    if (!updatedTicket) {
        const error = new Error('Ticket was updated by another user');
        error.code = 'VERSION_CONFLICT';
        throw error;
    }

    if (changesToAudit.length > 0) {
        await AuditTrail.insertMany(changesToAudit);
    }

    return updatedTicket;
};

const Ticket = mongoose.model('Ticket', ticketSchema);  
export default Ticket;