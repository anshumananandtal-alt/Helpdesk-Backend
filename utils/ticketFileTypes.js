const extensionsByMimeType = {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/tiff': '.tif',
};

export const getTicketFileExtension = (mimeType) => (
    Object.hasOwn(extensionsByMimeType, mimeType)
        ? extensionsByMimeType[mimeType]
        : undefined
);
