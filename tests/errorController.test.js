import { describe, expect, jest, test } from '@jest/globals';
import { errorHandler, notFoundHandler } from '../controllers/errorController.js';
import { makeRequest, makeResponse } from './testHelpers.js';

describe('error controller', () => {
    test('forwards errors when the response has already started', () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const error = new Error('late error');
        const next = jest.fn();
        const response = makeResponse();
        response.headersSent = true;

        errorHandler(error, makeRequest(), response, next);

        expect(next).toHaveBeenCalledWith(error);
    });

    test('uses the client status for invalid input errors', () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const response = makeResponse();

        errorHandler(Object.assign(new Error('Invalid image'), { status: 413 }), makeRequest(), response, jest.fn());

        expect(response.statusCode).toBe(413);
        expect(response.body).toEqual({ message: 'Invalid image' });
    });

    test('maps unsupported file errors to 400 and unknown errors to 500', () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const invalidResponse = makeResponse();
        const unknownResponse = makeResponse();

        errorHandler(new Error('Only PNG and JPEG images are supported'), makeRequest(), invalidResponse, jest.fn());
        errorHandler(new Error('database details'), makeRequest(), unknownResponse, jest.fn());

        expect(invalidResponse.statusCode).toBe(400);
        expect(unknownResponse.statusCode).toBe(500);
        expect(unknownResponse.body).toEqual({ message: 'Internal Server Error' });
    });

    test('returns the not-found response', () => {
        const response = makeResponse();

        notFoundHandler(makeRequest(), response, jest.fn());

        expect(response.statusCode).toBe(404);
        expect(response.body).toEqual({ message: 'Resource not found' });
    });
});
