import { afterAll, afterEach, beforeAll, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import connectDB from '../utils/database.js';
import User from '../models/user.js';

export const makeRequest = (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    files: [],
    ...overrides,
});

export const makeResponse = () => {
    const response = {
        statusCode: 200,
        body: undefined,
        headersSent: false,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
        sendStatus(code) {
            this.statusCode = code;
            return this;
        },
    };
    return response;
};

export const setupTestDatabase = () => {
    const users = {};
    let mongo;

    process.env.JWT_SECRET = 'helpdesk-test-jwt-secret';

    beforeAll(async () => {
        mongo = await MongoMemoryServer.create();
        process.env.MONGODB_URI = `${mongo.getUri()}helpdesk-test`;
        await connectDB();
    });

    beforeEach(async () => {
        await Promise.all(
            Object.values(mongoose.connection.collections).map((collection) =>
                collection.deleteMany({})
            )
        );
        users.customer = await User.create({
            name: 'customer user',
            email: 'customer@example.test',
            password: 'stored-test-password',
            role: 'customer',
        });
        users.agent = await User.create({
            name: 'agent user',
            email: 'agent@example.test',
            password: 'stored-test-password',
            role: 'agent',
        });
        users.admin = await User.create({
            name: 'admin user',
            email: 'admin@example.test',
            password: 'stored-test-password',
            role: 'admin',
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongo?.stop();
        delete process.env.MONGODB_URI;
    });

    return users;
};

export const makeUserRequest = (user, overrides = {}) => makeRequest({
    userId: user._id.toString(),
    userRole: user.role,
    ...overrides,
});
