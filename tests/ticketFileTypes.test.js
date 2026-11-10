import { describe, expect, test } from '@jest/globals';
import { getTicketFileExtension } from '../utils/ticketFileTypes.js';

describe('ticket file types', () => {
    test.each([
        ['application/pdf', '.pdf'],
        ['application/msword', '.doc'],
        ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx'],
        ['image/png', '.png'],
        ['image/jpeg', '.jpg'],
        ['image/gif', '.gif'],
        ['image/webp', '.webp'],
        ['image/bmp', '.bmp'],
        ['image/tiff', '.tif'],
    ])('accepts %s files', (mimeType, extension) => {
        expect(getTicketFileExtension(mimeType)).toBe(extension);
    });

    test('rejects unsupported file types', () => {
        expect(getTicketFileExtension('text/plain')).toBeUndefined();
        expect(getTicketFileExtension('toString')).toBeUndefined();
    });
});
