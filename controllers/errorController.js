export const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    if (res.headersSent) {
        return next(err);
    }
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500
        ? err.status
        : err.name === 'MulterError' || err.message?.startsWith('Only ')
            ? 400
            : 500;
    res.status(status).json({
        message: status >= 400 && status < 500 ? err.message : 'Internal Server Error',
    });
}   


export const notFoundHandler = (req, res, next) => {
    res.status(404).json({ message: 'Resource not found' });
}