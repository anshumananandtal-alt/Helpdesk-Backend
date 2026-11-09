import { describe, expect, jest, test } from '@jest/globals';
import Ticket from '../models/ticket.js';
import { getDashboard } from '../controllers/adminController.js';
import { makeRequest, makeResponse, setupTestDatabase } from './testHelpers.js';

setupTestDatabase();

describe('admin controller', () => {
    test('returns dashboard metrics from the aggregation', async () => {
        const response = makeResponse();

        await getDashboard(makeRequest(), response);

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual(expect.objectContaining({
            ticketCountPerStatus: expect.any(Array),
            averageResolutionHours: expect.any(Number),
            breachedTicketsPerPriority: expect.any(Array),
        }));
    });

    test('returns an error when dashboard aggregation fails', async () => {
        jest.spyOn(Ticket, 'aggregate').mockRejectedValueOnce(new Error('aggregate failed'));
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const response = makeResponse();

        await getDashboard(makeRequest(), response);

        expect(response.statusCode).toBe(500);
        expect(response.body).toEqual({ message: 'Error generating admin dashboard' });
    });
});
