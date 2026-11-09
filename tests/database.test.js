import { expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { setupTestDatabase } from './testHelpers.js';

setupTestDatabase();

test('uses the isolated helpdesk-test database', () => {
    expect(mongoose.connection.name).toBe('helpdesk-test');
    expect(mongoose.connection.readyState).toBe(1);
});
