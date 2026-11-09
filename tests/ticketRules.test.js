import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Ticket from '../models/ticket.js';
import User from '../models/user.js';
import { getAllowedNextStatuses } from '../utils/ticketRules.js';

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
