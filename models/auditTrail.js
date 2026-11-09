import mongoose from "mongoose";

const auditTrailSchema = new mongoose.Schema({
    ticket: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket'
    },
    comment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment'
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        enum: [
            'created',
            'updated',
            'deleted',
            'status changed',
            'assignee changed',
            'priority changed',
            'comment created',
            'comment updated',
            'comment deleted'
        ],
        required: true
    },
    field: {
        type: String,
        enum: ['status', 'assignee', 'priority']
    },
    oldValue: {
        type: mongoose.Schema.Types.Mixed
    },
    newValue: {
        type: mongoose.Schema.Types.Mixed
    }
}, { timestamps: true });

const AuditTrail = mongoose.model('AuditTrail', auditTrailSchema);

export default AuditTrail;