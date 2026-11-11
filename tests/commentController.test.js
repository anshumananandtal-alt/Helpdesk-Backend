import { describe, expect, test } from '@jest/globals';
import Comment from '../models/comments.js';
import Ticket from '../models/ticket.js';
import {
    createComment,
    deleteComment,
    getCommentsByTicketId,
    updateComment,
} from '../controllers/commentController.js';
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

describe('comment controller', () => {
    test('creates public comments and internal notes for staff only', async () => {
        const ticket = await makeTicket({ assignee: users.agent._id });
        const publicResponse = makeResponse();

        await createComment(makeUserRequest(users.customer, {
            params: { ticketId: ticket._id.toString() },
            body: { text: ' I still need help. ' },
        }), publicResponse);
        expect(publicResponse.statusCode).toBe(201);
        expect(publicResponse.body.text).toBe('I still need help.');

        const internalResponse = makeResponse();
        await createComment(makeUserRequest(users.agent, {
            params: { ticketId: ticket._id.toString() },
            body: { text: 'Check payment provider logs.', isInternal: true },
        }), internalResponse);
        expect(internalResponse.statusCode).toBe(201);
        expect(internalResponse.body.isInternal).toBe(true);

        const denied = makeResponse();
        await createComment(makeUserRequest(users.customer, {
            params: { ticketId: ticket._id.toString() },
            body: { text: 'Private note', isInternal: true },
        }), denied);
        expect(denied.statusCode).toBe(403);
    });

    test('rejects adding or changing comments and notes on closed tickets', async () => {
        const ticket = await makeTicket({ status: 'closed' });
        const existingComment = await Comment.create({
            ticket: ticket._id,
            author: users.customer._id,
            text: 'Final customer reply',
        });

        const publicResponse = makeResponse();
        await createComment(makeUserRequest(users.customer, {
            params: { ticketId: ticket._id.toString() },
            body: { text: 'Another reply' },
        }), publicResponse);
        expect(publicResponse.statusCode).toBe(409);

        const internalResponse = makeResponse();
        await createComment(makeUserRequest(users.agent, {
            params: { ticketId: ticket._id.toString() },
            body: { text: 'Another note', isInternal: true },
        }), internalResponse);
        expect(internalResponse.statusCode).toBe(409);

        const updateResponse = makeResponse();
        await updateComment(makeUserRequest(users.customer, {
            params: { ticketId: ticket._id.toString(), commentId: existingComment._id.toString() },
            body: { text: 'Changed after closing' },
        }), updateResponse);
        expect(updateResponse.statusCode).toBe(409);
        expect(await Comment.countDocuments({ ticket: ticket._id })).toBe(1);
    });

    test('hides internal notes from customers and lists notes for assigned agents', async () => {
        const ticket = await makeTicket({ assignee: users.agent._id });
        await Comment.create([
            { ticket: ticket._id, author: users.customer._id, text: 'Public reply' },
            { ticket: ticket._id, author: users.agent._id, text: 'Staff note', isInternal: true },
        ]);
        const customerResponse = makeResponse();
        const agentResponse = makeResponse();

        await getCommentsByTicketId(makeUserRequest(users.customer, {
            params: { ticketId: ticket._id.toString() },
        }), customerResponse);
        await getCommentsByTicketId(makeUserRequest(users.agent, {
            params: { ticketId: ticket._id.toString() },
        }), agentResponse);

        expect(customerResponse.body).toHaveLength(1);
        expect(customerResponse.body[0].isInternal).toBe(false);
        expect(agentResponse.body).toHaveLength(2);
    });

    test('updates and deletes a comment by its author and rejects other authors', async () => {
        const ticket = await makeTicket({ assignee: users.agent._id });
        const comment = await Comment.create({
            ticket: ticket._id,
            author: users.customer._id,
            text: 'Original comment',
        });
        const updateResponse = makeResponse();

        await updateComment(makeUserRequest(users.customer, {
            params: { ticketId: ticket._id.toString(), commentId: comment._id.toString() },
            body: { text: 'Updated comment' },
        }), updateResponse);
        expect(updateResponse.statusCode).toBe(200);
        expect(updateResponse.body.text).toBe('Updated comment');

        const denied = makeResponse();
        await deleteComment(makeUserRequest(users.agent, {
            params: { ticketId: ticket._id.toString(), commentId: comment._id.toString() },
        }), denied);
        expect(denied.statusCode).toBe(403);

        const deleted = makeResponse();
        await deleteComment(makeUserRequest(users.customer, {
            params: { ticketId: ticket._id.toString(), commentId: comment._id.toString() },
        }), deleted);
        expect(deleted.statusCode).toBe(200);
        expect(await Comment.findById(comment._id)).toBeNull();
    });
});
