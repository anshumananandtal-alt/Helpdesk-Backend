import { describe, expect, jest, test } from '@jest/globals';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import emailService from '../utils/emailService.js';
import {
    createUser,
    deleteUser,
    getAgents,
    getUser,
    getUsers,
    loginUser,
    updateUser,
} from '../controllers/userController.js';
import {
    makeRequest,
    makeResponse,
    makeUserRequest,
    setupTestDatabase,
} from './testHelpers.js';

const users = setupTestDatabase();

describe('user controller', () => {
    test('lists users with pagination metadata without exposing password fields', async () => {
        const response = makeResponse();

        await getUsers(makeRequest({ query: { page: '2', limit: '2' } }), response);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            page: 2,
            limit: 2,
            total: 3,
            totalPages: 2,
        }));
        expect(response.body.users).toHaveLength(1);
        expect(response.body.users[0].password).toBeUndefined();
    });

    test('rejects invalid pagination values', async () => {
        const response = makeResponse();

        await getUsers(makeRequest({ query: { page: '0', limit: '101' } }), response);

        expect(response.statusCode).toBe(400);
        expect(response.body.message).toMatch(/page must be positive/);
    });

    test('lists agent users', async () => {
        const response = makeResponse();

        await getAgents(makeRequest(), response);

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].role).toBe('agent');
        expect(response.body[0].password).toBeUndefined();
    });

    test('returns a user to that user and denies access to other users', async () => {
        const response = makeResponse();

        await getUser(makeUserRequest(users.customer, {
            params: { id: users.customer._id.toString() },
        }), response);
        expect(response.statusCode).toBe(200);
        expect(response.body.email).toBe(users.customer.email);

        const denied = makeResponse();
        await getUser(makeUserRequest(users.agent, {
            params: { id: users.customer._id.toString() },
        }), denied);
        expect(denied.statusCode).toBe(403);
    });

    test('registers a customer, hashes the password, and returns a JWT', async () => {
        const sendEmail = jest.spyOn(emailService, 'sendEmail').mockResolvedValue({});
        const response = makeResponse();

        await createUser(makeRequest({
            body: { name: 'New customer', email: 'new@example.test', password: 'long-password' },
        }), response);

        expect(response.statusCode).toBe(201);
        expect(response.body.user.role).toBe('customer');
        expect(response.body.user.password).toBeUndefined();
        expect(jwt.verify(response.body.token, process.env.JWT_SECRET).role).toBe('customer');
        expect(sendEmail).toHaveBeenCalledWith({
            to: 'new@example.test',
            subject: 'Welcome to Helpdesk',
            text: 'Hello New customer,\n\nYour Helpdesk account has been created successfully.',
        });
        const storedUser = await User.findOne({ email: 'new@example.test' }).select('+password');
        expect(storedUser.password).not.toBe('long-password');
    });

    test('rejects invalid registration input', async () => {
        const response = makeResponse();

        await createUser(makeRequest({
            body: { name: '   ', email: 'bad', password: 'short' },
        }), response);

        expect(response.statusCode).toBe(400);
    });

    test('rejects duplicate registration email addresses', async () => {
        const response = makeResponse();

        await createUser(makeRequest({
            body: { name: 'Duplicate', email: users.customer.email, password: 'long-password' },
        }), response);

        expect(response.statusCode).toBe(409);
    });

    test('updates user role and active status and rejects invalid updates', async () => {
        const response = makeResponse();

        await updateUser(makeUserRequest(users.admin, {
            params: { id: users.customer._id.toString() },
            body: { role: 'agent', isActive: false },
        }), response);
        expect(response.statusCode).toBe(200);
        expect(response.body.role).toBe('agent');
        expect(response.body.isActive).toBe(false);

        const invalid = makeResponse();
        await updateUser(makeUserRequest(users.admin, {
            params: { id: users.customer._id.toString() },
            body: { role: 'support' },
        }), invalid);
        expect(invalid.statusCode).toBe(400);

        const invalidActiveStatus = makeResponse();
        await updateUser(makeUserRequest(users.admin, {
            params: { id: users.customer._id.toString() },
            body: { isActive: 'false' },
        }), invalidActiveStatus);
        expect(invalidActiveStatus.statusCode).toBe(400);

        const emptyUpdate = makeResponse();
        await updateUser(makeUserRequest(users.admin, {
            params: { id: users.customer._id.toString() },
            body: { name: 'Changed name' },
        }), emptyUpdate);
        expect(emptyUpdate.statusCode).toBe(400);
    });

    test('prevents an administrator from removing their own access or the last active admin', async () => {
        const selfUpdate = makeResponse();

        await updateUser(makeUserRequest(users.admin, {
            params: { id: users.admin._id.toString() },
            body: { isActive: false },
        }), selfUpdate);
        expect(selfUpdate.statusCode).toBe(403);

        const lastAdminUpdate = makeResponse();
        await updateUser(makeUserRequest(users.agent, {
            params: { id: users.admin._id.toString() },
            body: { role: 'customer' },
        }), lastAdminUpdate);
        expect(lastAdminUpdate.statusCode).toBe(409);

        const lastAdminDelete = makeResponse();
        await deleteUser(makeUserRequest(users.agent, {
            params: { id: users.admin._id.toString() },
        }), lastAdminDelete);
        expect(lastAdminDelete.statusCode).toBe(409);
    });

    test('prevents self-deletion and deletes another user', async () => {
        const selfDelete = makeResponse();

        await deleteUser(makeUserRequest(users.admin, {
            params: { id: users.admin._id.toString() },
        }), selfDelete);
        expect(selfDelete.statusCode).toBe(403);

        const response = makeResponse();

        await deleteUser(makeUserRequest(users.admin, {
            params: { id: users.customer._id.toString() },
        }), response);

        expect(response.statusCode).toBe(200);
        expect(await User.findById(users.customer._id)).toBeNull();
    });

    test('logs in an active user, rejects invalid credentials, and blocks deactivated users', async () => {
        const password = 'correct-password';
        await User.updateOne(
            { _id: users.customer._id },
            { password: await bcrypt.hash(password, 10) }
        );
        const response = makeResponse();

        await loginUser(makeRequest({
            body: { email: users.customer.email.toUpperCase(), password },
        }), response);

        expect(response.statusCode).toBe(200);
        expect(response.body.token).toBeTruthy();

        const invalid = makeResponse();
        await loginUser(makeRequest({
            body: { email: users.customer.email, password: 'wrong-password' },
        }), invalid);
        expect(invalid.statusCode).toBe(401);

        await User.updateOne({ _id: users.customer._id }, { isActive: false });
        const inactive = makeResponse();
        await loginUser(makeRequest({
            body: { email: users.customer.email, password },
        }), inactive);
        expect(inactive.statusCode).toBe(403);
    });
});
