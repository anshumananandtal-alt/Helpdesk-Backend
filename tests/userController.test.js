import { describe, expect, jest, test } from '@jest/globals';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import emailService from '../utils/emailService.js';
import {
    createUser,
    deleteUser,
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
    test('lists users without exposing password fields', async () => {
        const response = makeResponse();

        await getUsers(makeRequest(), response);

        expect(response.body).toHaveLength(3);
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
            body: { name: 'New', email: 'bad', password: 'short' },
        }), response);

        expect(response.statusCode).toBe(400);
    });

    test('updates a user role and rejects invalid role values', async () => {
        const response = makeResponse();

        await updateUser(makeUserRequest(users.admin, {
            params: { id: users.customer._id.toString() },
            body: { role: 'agent' },
        }), response);
        expect(response.statusCode).toBe(200);
        expect(response.body.role).toBe('agent');

        const invalid = makeResponse();
        await updateUser(makeRequest({
            userId: users.admin._id.toString(),
            params: { id: users.customer._id.toString() },
            body: { role: 'support' },
        }), invalid);
        expect(invalid.statusCode).toBe(400);
    });

    test('deletes a user', async () => {
        const response = makeResponse();

        await deleteUser(makeUserRequest(users.admin, {
            params: { id: users.customer._id.toString() },
        }), response);

        expect(response.statusCode).toBe(200);
        expect(await User.findById(users.customer._id)).toBeNull();
    });

    test('logs in an active user and rejects invalid credentials', async () => {
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
    });
});
