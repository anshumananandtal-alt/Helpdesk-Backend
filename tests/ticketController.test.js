import { describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import AuditTrail from '../models/auditTrail.js';
import Ticket from '../models/ticket.js';
import {
    createTicket,
    deleteTicket,
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

    test('lists only tickets assigned to an agent, ignoring another assignee filter', async () => {
        await makeTicket({ assignee: users.agent._id });
        await makeTicket({ assignee: users.admin._id });
        const response = makeResponse();

        await getAllTickets(makeUserRequest(users.agent, {
            query: { assignee: users.admin._id.toString() },
        }), response);

        expect(response.body.total).toBe(1);
        expect(response.body.tickets[0].assignee._id.toString()).toBe(users.agent._id.toString());
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
        expect(await AuditTrail.countDocuments({
            ticket: response.body._id,
            action: 'created',
        })).toBe(1);
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

        const conflict = makeResponse();
        await updateTicket(makeUserRequest(users.agent, {
            params: { id: ticket._id.toString() },
            body: { version: 1, status: 'resolved' },
        }), conflict);
        expect(conflict.statusCode).toBe(409);
        expect(conflict.body.code).toBe('VERSION_CONFLICT');
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
