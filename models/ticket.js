import mongoose from "mongoose";
import AuditTrail from "./auditTrail.js";
import { STATUS_TRANSITIONS } from "../utils/ticketRules.js";
import { calculateSlaDeadline, getTicketSlaDeadline } from "../utils/sla.js";

const auditableFields = ['status', 'assignee', 'priority'];

const ticketSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        minlength: 5,
        trim: true,
    },
    description: {  
        type: String,
        required: true,
        minlength: 10,
        trim: true,
    },
    category: {
        type: String,
        trim: true,
    }, 
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'low'  
    },
    status: {
        type: String,
        enum: Object.keys(STATUS_TRANSITIONS),
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
    slaDeadline: {
        type: Date
    },
    slaDueAt: {
        type: Date,
        select: false,
    },
    slaPausedAt: {
        type: Date,
        select: false,
    },
    breached: {
        type: Boolean,
        default: false
    },
    version: {
        type: Number,
        default: 1  
    },  
    closedAt: {
        type: Date,
        select: false,
    }
}, { timestamps: true });

ticketSchema.index({ title: 'text' });

ticketSchema.pre('validate', function () {
    if (!this.slaDeadline && !this.slaDueAt && this.isNew) {
        this.slaDeadline = calculateSlaDeadline(this.priority);
        this.slaDueAt = this.slaDeadline;
    } else if (this.slaDueAt && !this.slaDeadline) {
        this.slaDeadline = this.slaDueAt;
    } else if (this.slaDeadline && !this.slaDueAt) {
        this.slaDueAt = this.slaDeadline;
    }
});

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

    const ticket = await this.findOne({ _id: ticketId, version: expectedVersion })
        .select('+slaDueAt +slaPausedAt');
    if (!ticket) {
        const error = new Error('Ticket was updated by another user');
        error.code = 'VERSION_CONFLICT';
        throw error;
    }

    const definedChanges = Object.fromEntries(
        Object.entries(changes).filter(([, value]) => value !== undefined)
    );
    if (definedChanges.status && definedChanges.status !== ticket.status) {
        if (!STATUS_TRANSITIONS[ticket.status]?.includes(definedChanges.status)) {
            const error = new Error(`Invalid status transition: ${ticket.status} -> ${definedChanges.status}`);
            error.code = 'INVALID_STATUS_TRANSITION';
            throw error;
        }
    }
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

    const now = new Date();
    const update = {
        $set: { ...definedChanges },
        $inc: { version: 1 }
    };
    if (definedChanges.status === 'waiting_on_customer' &&
        ticket.status !== 'waiting_on_customer') {
        update.$set.slaPausedAt = now;
    }
    if (ticket.status === 'waiting_on_customer' &&
        definedChanges.status && definedChanges.status !== 'waiting_on_customer') {
        const deadline = getTicketSlaDeadline(ticket);
        if (deadline) {
            const pausedAt = ticket.slaPausedAt ?? ticket.updatedAt ?? now;
            const extendedDeadline = new Date(
                deadline.getTime() + now.getTime() - new Date(pausedAt).getTime()
            );
            update.$set.slaDueAt = extendedDeadline;
            update.$set.slaDeadline = extendedDeadline;
        }
        update.$unset = { slaPausedAt: 1 };
    }
    if (definedChanges.status === 'resolved') {
        update.$set.resolvedAt = now;
    } else if (definedChanges.status === 'reopened') {
        update.$unset = { ...update.$unset, resolvedAt: 1 };
    }
    const updatedTicket = await this.findOneAndUpdate(
        { _id: ticketId, version: expectedVersion },
        update,
        { returnDocument: 'after', runValidators: true }
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