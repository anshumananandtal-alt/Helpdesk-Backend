import { describe, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { S3Client } from '@aws-sdk/client-s3';
import AuditTrail from '../models/auditTrail.js';
import Ticket from '../models/ticket.js';
import emailService from '../utils/emailService.js';
import {
    createTicket,
    deleteTicket,
    deleteTicketImage,
    getAllTickets,
    getTicketAudit,
    getTicketById,
    updateTicket,
} from '../controllers/ticketController.js';
import {
    makeRequest,
    makeResponse,
    makeUserRequest,
    setupTestDatabase,
} from './testHelpers.js';

const users = setupTestDatabase();

const makeTicket = (fields = {}) => Ticket.create({
    title: 'Checkout payment issue',
    description: 'Payment fails when I submit the checkout form.',
    creator: users.customer._id,
    ...fields,
});

describe('ticket controller', () => {
    test('defines a text index on ticket titles', () => {
        expect(Ticket.schema.indexes().some(([fields]) => fields.title === 'text')).toBe(true);
    });

    test('lists only tickets created by the customer and paginates results', async () => {
        await makeTicket();
        await makeTicket({ creator: users.agent._id });
        const response = makeResponse();

        await getAllTickets(makeUserRequest(users.customer, {
            query: { page: '1', limit: '1' },
        }), response);

        expect(response.body).toMatchObject({ page: 1, limit: 1, total: 1, totalPages: 1 });
        expect(response.body.tickets).toHaveLength(1);
        expect(response.body.tickets[0].creator._id.toString()).toBe(users.customer._id.toString());
    });

    test('lets agents view all tickets and filter by assignee', async () => {
        await makeTicket({ assignee: users.agent._id });
        await makeTicket({ assignee: users.admin._id });
        const response = makeResponse();

        await getAllTickets(makeUserRequest(users.agent), response);

        expect(response.body.total).toBe(2);

        const filtered = makeResponse();
        await getAllTickets(makeUserRequest(users.agent, {
            query: { assignee: users.admin._id.toString() },
        }), filtered);
        expect(filtered.body.total).toBe(1);
        expect(filtered.body.tickets[0].assignee._id.toString()).toBe(users.admin._id.toString());
    });

    test('returns a ticket only to an authorized user', async () => {
        const ticket = await makeTicket({ assignee: users.agent._id });
        const response = makeResponse();

        await getTicketById(makeUserRequest(users.agent, {
            params: { id: ticket._id.toString() },
        }), response);
        expect(response.statusCode).toBe(200);

        const denied = makeResponse();
        await getTicketById(makeUserRequest(users.customer, {
            params: { id: new mongoose.Types.ObjectId().toString() },
        }), denied);
        expect(denied.statusCode).toBe(404);
    });

    test('creates a ticket for the authenticated user and writes an audit record', async () => {
        const createdAt = Date.now();
        const response = makeResponse();

        await createTicket(makeUserRequest(users.customer, {
            body: {
                title: 'Checkout payment issue',
                description: 'Payment fails on submitting the form.',
                priority: 'high',
            },
        }), response);

        expect(response.statusCode).toBe(201);
        expect(response.body.creator.toString()).toBe(users.customer._id.toString());
        expect(new Date(response.body.slaDeadline).getTime()).toBeGreaterThanOrEqual(
            createdAt + 8 * 60 * 60 * 1000
        );
        expect(new Date(response.body.slaDeadline).getTime()).toBeLessThanOrEqual(
            Date.now() + 8 * 60 * 60 * 1000
        );
        expect(await AuditTrail.countDocuments({
            ticket: response.body._id,
            action: 'created',
        })).toBe(1);
    });

    test('calculates an SLA deadline for legacy tickets without a stored deadline', async () => {
        const createdAt = new Date('2026-01-01T00:00:00.000Z');
        const ticketId = new mongoose.Types.ObjectId();
        await Ticket.collection.insertOne({
            _id: ticketId,
            title: 'Legacy payment issue',
            description: 'A previously created ticket without an SLA deadline.',
            priority: 'urgent',
            status: 'open',
            creator: users.customer._id,
            fileName: [],
            version: 1,
            createdAt,
            updatedAt: createdAt,
        });
        const response = makeResponse();

        await getTicketById(makeUserRequest(users.customer, {
            params: { id: ticketId.toString() },
        }), response);

        expect(response.statusCode).toBe(200);
        expect(new Date(response.body.slaDeadline).getTime()).toBe(
            createdAt.getTime() + 4 * 60 * 60 * 1000
        );
    });

    test('updates an assigned ticket and reports stale versions', async () => {
        const ticket = await makeTicket({ assignee: users.agent._id });
        const response = makeResponse();

        await updateTicket(makeUserRequest(users.agent, {
            params: { id: ticket._id.toString() },
            body: { version: 1, status: 'in_progress' },
        }), response);

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe('in_progress');
        expect(response.body.version).toBe(2);
        const statusAudit = await AuditTrail.findOne({
            ticket: ticket._id,
            field: 'status',
        });
        expect(statusAudit.changedBy.toString()).toBe(users.agent._id.toString());
        expect(statusAudit.oldValue).toBe('open');
        expect(statusAudit.newValue).toBe('in_progress');

        const conflict = makeResponse();
        await updateTicket(makeUserRequest(users.agent, {
            params: { id: ticket._id.toString() },
            body: { version: 1, status: 'resolved' },
        }), conflict);
        expect(conflict.statusCode).toBe(409);
        expect(conflict.body.code).toBe('VERSION_CONFLICT');
    });

    test('allows an agent to claim an unassigned ticket', async () => {
        jest.spyOn(emailService, 'sendEmail').mockResolvedValue({});
        const ticket = await makeTicket();
        const response = makeResponse();

        await updateTicket(makeUserRequest(users.agent, {
            params: { id: ticket._id.toString() },
            body: { version: 1, assignee: users.agent._id.toString() },
        }), response);

        expect(response.statusCode).toBe(200);
        expect(response.body.assignee._id.toString()).toBe(users.agent._id.toString());
        const assigneeAudit = await AuditTrail.findOne({
            ticket: ticket._id,
            field: 'assignee',
        });
        expect(assigneeAudit.changedBy.toString()).toBe(users.agent._id.toString());
        expect(assigneeAudit.oldValue).toBeNull();
        expect(assigneeAudit.newValue.toString()).toBe(users.agent._id.toString());

        const unassign = makeResponse();
        await updateTicket(makeUserRequest(users.agent, {
            params: { id: ticket._id.toString() },
            body: { version: 2, assignee: null },
        }), unassign);
        expect(unassign.statusCode).toBe(403);
    });

    test('allows a customer to upload a file and resume a waiting ticket', async () => {
        jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({});
        const existingFile = 'images/existing.png';
        const ticket = await makeTicket({
            status: 'waiting_on_customer',
            fileName: [existingFile],
        });
        const response = makeResponse();

        await updateTicket(makeUserRequest(users.customer, {
            params: { id: ticket._id.toString() },
            body: { version: 1, status: 'in_progress' },
            files: [{ mimetype: 'image/png', buffer: Buffer.from('customer response') }],
        }), response);

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe('in_progress');
        expect(response.body.fileName).toHaveLength(2);
        expect(response.body.fileName[0]).toBe(existingFile);
        expect(response.body.fileName[1]).toMatch(/^images\/.+\.png$/);
        expect(response.body.version).toBe(2);
    });

    test('allows a customer to upload files without changing a waiting ticket status', async () => {
        jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({});
        const ticket = await makeTicket({ status: 'waiting_on_customer' });
        const response = makeResponse();

        await updateTicket(makeUserRequest(users.customer, {
            params: { id: ticket._id.toString() },
            body: { version: 1 },
            files: [{ mimetype: 'application/pdf', buffer: Buffer.from('customer details') }],
        }), response);

        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe('waiting_on_customer');
        expect(response.body.fileName).toHaveLength(1);
        expect(response.body.version).toBe(2);
    });

    test('rejects adding or deleting attachments on closed tickets', async () => {
        const ticket = await makeTicket({
            status: 'closed',
            fileName: ['images/closed.pdf'],
        });
        const uploadResponse = makeResponse();

        await updateTicket(makeUserRequest(users.admin, {
            params: { id: ticket._id.toString() },
            body: { version: 1 },
            files: [{ mimetype: 'application/pdf', buffer: Buffer.from('new details') }],
        }), uploadResponse);
        expect(uploadResponse.statusCode).toBe(409);

        const deleteResponse = makeResponse();
        await deleteTicketImage(makeUserRequest(users.admin, {
            params: { id: ticket._id.toString(), imageIndex: '0' },
        }), deleteResponse);
        expect(deleteResponse.statusCode).toBe(409);
        expect((await Ticket.findById(ticket._id)).fileName).toEqual(['images/closed.pdf']);
    });

    test('rejects invalid status transitions', async () => {
        const ticket = await makeTicket({ status: 'resolved' });
        const response = makeResponse();

        await updateTicket(makeUserRequest(users.admin, {
            params: { id: ticket._id.toString() },
            body: { version: 1, status: 'in_progress' },
        }), response);

        expect(response.statusCode).toBe(422);
        expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    test('preserves existing files when updating a ticket', async () => {
        const existingFile = 'images/existing.png';
        const ticket = await makeTicket({ fileName: [existingFile] });
        const response = makeResponse();

        await updateTicket(makeUserRequest(users.admin, {
            params: { id: ticket._id.toString() },
            body: { version: 1, title: 'Updated checkout payment issue', existingFileNames: '[]' },
        }), response);

        expect(response.statusCode).toBe(200);
        expect(response.body.fileName).toEqual([existingFile]);
    });

    test('appends new uploads without removing existing files', async () => {
        jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({});
        const existingFile = 'images/existing.png';
        const ticket = await makeTicket({ fileName: [existingFile] });
        const response = makeResponse();

        await updateTicket(makeUserRequest(users.admin, {
            params: { id: ticket._id.toString() },
            body: { version: 1 },
            files: [{ mimetype: 'image/png', buffer: Buffer.from('new image') }],
        }), response);

        expect(response.statusCode).toBe(200);
        expect(response.body.fileName).toHaveLength(2);
        expect(response.body.fileName[0]).toBe(existingFile);
        expect(response.body.fileName[1]).toMatch(/^images\/.+\.png$/);
    });

    test('deletes only the selected file and increments the ticket version', async () => {
        const deleteObject = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({});
        const ticket = await makeTicket({
            fileName: ['images/remove.png', 'images/keep.pdf'],
        });
        const response = makeResponse();

        await deleteTicketImage(makeUserRequest(users.admin, {
            params: { id: ticket._id.toString(), imageIndex: '0' },
        }), response);

        expect(response.statusCode).toBe(200);
        expect(response.body.version).toBe(2);
        expect((await Ticket.findById(ticket._id)).fileName).toEqual(['images/keep.pdf']);
        expect(deleteObject).toHaveBeenCalledTimes(1);
    });

    test('returns not found for an invalid ticket file index', async () => {
        const response = makeResponse();

        await deleteTicketImage(makeUserRequest(users.admin, {
            params: { id: new mongoose.Types.ObjectId().toString(), imageIndex: 'invalid' },
        }), response);

        expect(response.statusCode).toBe(404);
    });

    test('emails an agent when a ticket is assigned to them', async () => {
        const sendEmail = jest.spyOn(emailService, 'sendEmail').mockResolvedValue({});
        const ticket = await makeTicket();
        const response = makeResponse();

        await updateTicket(makeUserRequest(users.admin, {
            params: { id: ticket._id.toString() },
            body: { version: 1, assignee: users.agent._id.toString() },
        }), response);

        expect(response.statusCode).toBe(200);
        expect(sendEmail).toHaveBeenCalledWith({
            to: users.agent.email,
            subject: 'A helpdesk ticket has been assigned to you',
            text: `Hello ${users.agent.name},\n\nTicket "${ticket.title}" has been assigned to you.\nTicket ID: ${ticket._id}`,
        });
    });

    test('deletes tickets only for admins', async () => {
        const ticket = await makeTicket({ assignee: users.agent._id });
        const denied = makeResponse();

        await deleteTicket(makeUserRequest(users.agent, {
            params: { id: ticket._id.toString() },
        }), denied);
        expect(denied.statusCode).toBe(403);

        const response = makeResponse();
        await deleteTicket(makeUserRequest(users.admin, {
            params: { id: ticket._id.toString() },
        }), response);
        expect(response.statusCode).toBe(200);
        expect(await Ticket.findById(ticket._id)).toBeNull();
    });

    test('returns staff audit records and denies customer audit access', async () => {
        const ticket = await makeTicket({ assignee: users.agent._id });
        await AuditTrail.create({
            ticket: ticket._id,
            changedBy: users.agent._id,
            action: 'status changed',
            field: 'status',
            oldValue: 'open',
            newValue: 'in_progress',
        });
        const response = makeResponse();

        await getTicketAudit(makeUserRequest(users.agent, {
            params: { id: ticket._id.toString() },
        }), response);
        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveLength(1);

        const denied = makeResponse();
        await getTicketAudit(makeUserRequest(users.customer, {
            params: { id: ticket._id.toString() },
        }), denied);
        expect(denied.statusCode).toBe(403);
    });
});
