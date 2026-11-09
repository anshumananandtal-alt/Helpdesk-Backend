import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Ticket from '../models/ticket.js';
import User from '../models/user.js';
import { getAllowedNextStatuses } from '../utils/ticketRules.js';
import { getBreachedFilter, isTicketBreached } from '../utils/sla.js';
import { canAccessTicket } from '../utils/ticketAccess.js';

const customer = { id: 'customer-1', role: 'customer' };
const otherCustomer = { id: 'customer-2', role: 'customer' };
const agent = { id: 'agent-1', role: 'agent' };
const admin = { id: 'admin-1', role: 'admin' };

test('status transitions enforce each role and ownership', () => {
    assert.deepEqual(getAllowedNextStatuses({ status: 'open' }, customer), []);
    assert.deepEqual(getAllowedNextStatuses({ status: 'open' }, agent), ['in_progress']);
    assert.deepEqual(getAllowedNextStatuses({ status: 'in_progress' }, agent), [
        'waiting_on_customer',
        'resolved',
    ]);
    assert.deepEqual(getAllowedNextStatuses({ status: 'waiting_on_customer' }, agent), [
        'in_progress',
        'resolved',
    ]);
    assert.deepEqual(getAllowedNextStatuses({
        status: 'resolved',
        creator: 'customer-1',
    }, customer), ['closed', 'reopened']);
    assert.deepEqual(getAllowedNextStatuses({
        status: 'resolved',
        creator: 'customer-1',
    }, otherCustomer), []);
    assert.deepEqual(getAllowedNextStatuses({ status: 'resolved' }, agent), []);
    assert.deepEqual(getAllowedNextStatuses({ status: 'resolved' }, admin), ['closed', 'reopened']);
    assert.deepEqual(getAllowedNextStatuses({ status: 'closed' }, admin), []);
});

test('new tickets receive the priority-based SLA deadline and open status', async () => {
    const now = Date.now();
    const ticket = new Ticket({
        title: 'Unable to access account',
        description: 'The application rejects my valid login details.',
        priority: 'urgent',
        creator: new mongoose.Types.ObjectId(),
    });
    await ticket.validate();

    assert.equal(ticket.status, 'open');
    assert.ok(ticket.slaDeadline instanceof Date);
    assert.ok(ticket.slaDeadline.getTime() >= now + 4 * 60 * 60 * 1000 - 1000);
    assert.ok(ticket.slaDeadline.getTime() <= now + 4 * 60 * 60 * 1000 + 1000);
});

test('public user roles are restricted to customer, agent, and admin', async () => {
    const user = new User({
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashed-password',
        role: 'support',
    });
    const error = await user.validate().then(() => null, (validationError) => validationError);

    assert.ok(error);
    assert.ok(error.errors.role);
});

test('legacy persisted breached tickets without an SLA deadline remain breached', () => {
    const legacyTicket = {
        status: 'open',
        priority: 'urgent',
        breached: true,
    };
    const filter = getBreachedFilter(true, new Date('2026-11-09T12:00:00.000Z'));

    assert.equal(isTicketBreached(legacyTicket, new Date('2026-11-09T12:00:00.000Z')), true);
    assert.ok(filter.$and[1].$or.some((condition) => condition.breached === true));
});

test('resolved, closed, and paused tickets do not count as breached', () => {
    const now = new Date('2026-11-09T12:00:00.000Z');
    for (const status of ['resolved', 'closed', 'waiting_on_customer']) {
        assert.equal(isTicketBreached({
            status,
            breached: true,
            slaDeadline: new Date('2026-11-08T12:00:00.000Z'),
        }, now), false);
    }
});

test('customers see created tickets, agents see assigned tickets, and admins see all', () => {
    const ticket = {
        creator: 'customer-1',
        assignee: 'agent-1',
    };

    assert.equal(canAccessTicket(ticket, customer), true);
    assert.equal(canAccessTicket(ticket, otherCustomer), false);
    assert.equal(canAccessTicket(ticket, agent), true);
    assert.equal(canAccessTicket(ticket, { id: 'agent-2', role: 'agent' }), false);
    assert.equal(canAccessTicket(ticket, admin), true);
});
