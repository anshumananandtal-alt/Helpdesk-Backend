import express from 'express';
import connectDB from './utils/database.js';
import dotenv from 'dotenv';
import multer from 'multer';
import userRoutes from './routes/user.js';
import ticketRoutes from './routes/ticket.js';
import adminRoutes from './routes/admin.js';
import commentRoutes from './routes/comment.js';
import rateLimitier from './utils/rateLimiter.js';
import { errorHandler, notFoundHandler } from './controllers/errorController.js';
dotenv.config();    
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
    return cb(null, true);
  }
  return cb(null, false);
};
app.use(
  multer({
    storage: multer.memoryStorage(),
    fileFilter
  }).array('image')
);
app.use((req, res, next) => {
    res.setHeader(
        'Access-Control-Allow-Origin',
        'http://localhost:5173'
    );

    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );

    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
    );

    res.setHeader(
        'Access-Control-Allow-Credentials',
        'true'
    );

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});

app.use(rateLimitier); // Apply rate limiter to all routes
app.use('/api/tickets', ticketRoutes); // Use ticket routes for /api/tickets endpoint
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes); // Use user routes for /api/users endpoint
app.use('/api/comments', commentRoutes); // Use comment routes for /api/comments endpoint
app.use(errorHandler); // Use error handler middleware
app.use(notFoundHandler); // Use not found handler middleware
app.listen(8080, () => {
    connectDB().then(() => {
        console.log('Server is running on port 8080');
    }).catch((error) => {
        console.error('Failed to connect to the database:', error);
        process.exit(1);
    })
});