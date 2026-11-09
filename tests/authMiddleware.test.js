import { describe, expect, jest, test } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { requireAdmin, requireAuth, requireRole } from '../middleware/auth.js';
import { makeRequest, makeResponse, setupTestDatabase } from './testHelpers.js';

const users = setupTestDatabase();
const makeToken = (user) => jwt.sign(
    { id: user._id.toString(), role: user.role },
    process.env.JWT_SECRET
);

describe('auth middleware', () => {
    test('requires a bearer token', async () => {
        const response = makeResponse();
        const next = jest.fn();

        await requireAuth(makeRequest(), response, next);

        expect(response.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('sets the authenticated user from a valid token', async () => {
        const request = makeRequest({
            headers: { authorization: `Bearer ${makeToken(users.agent)}` },
        });
        const response = makeResponse();
        const next = jest.fn();

        await requireAuth(request, response, next);

        expect(request.userId).toBe(users.agent._id.toString());
        expect(request.userRole).toBe('agent');
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('rejects invalid tokens and inactive users', async () => {
        const invalidResponse = makeResponse();
        await requireAuth(makeRequest({
            headers: { authorization: 'Bearer invalid-token' },
        }), invalidResponse, jest.fn());
        expect(invalidResponse.statusCode).toBe(401);

        users.agent.isActive = false;
        await users.agent.save();
        const inactiveResponse = makeResponse();
        await requireAuth(makeRequest({
            headers: { authorization: `Bearer ${makeToken(users.agent)}` },
        }), inactiveResponse, jest.fn());
        expect(inactiveResponse.statusCode).toBe(401);
    });

    test('enforces role requirements and composes admin middleware', async () => {
        const forbidden = makeResponse();
        const deniedNext = jest.fn();
        requireRole('admin')(makeRequest({ userRole: 'agent' }), forbidden, deniedNext);
        expect(forbidden.statusCode).toBe(403);
        expect(deniedNext).not.toHaveBeenCalled();

        const request = makeRequest({
            headers: { authorization: `Bearer ${makeToken(users.admin)}` },
        });
        const response = makeResponse();
        const next = jest.fn();
        await requireAdmin[0](request, response, next);
        requireAdmin[1](request, response, next);
        expect(request.userRole).toBe('admin');
        expect(next).toHaveBeenCalledTimes(2);
    });
});
