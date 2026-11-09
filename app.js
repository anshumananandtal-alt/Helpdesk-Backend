import 'dotenv/config';
import express from 'express';
import connectDB from './utils/database.js';
import userRoutes from './routes/user.js';
import authRoutes from './routes/auth.js';
import ticketRoutes from './routes/ticket.js';
import adminRoutes from './routes/admin.js';
import commentRoutes from './routes/comment.js';
import { getDashboard } from './controllers/adminController.js';
import { requireAdmin } from './middleware/auth.js';
import rateLimiter from './utils/rateLimiter.js';
import { errorHandler, notFoundHandler } from './controllers/errorController.js';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(rateLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/admin', adminRoutes);
app.get('/api/dashboard', ...requireAdmin, getDashboard);
app.use('/api/users', userRoutes);
app.use('/api/comments', commentRoutes);
app.use(errorHandler);
app.use(notFoundHandler);

const startServer = async () => {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET must be configured before starting the server');
        }
        await connectDB();
        app.listen(process.env.PORT || 8080, () => {
            console.log(`Server is running on port ${process.env.PORT || 8080}`);
        });
    } catch (error) {
        console.error('Failed to start the server:', error);
        process.exit(1);
    }
};

startServer();

export default app;
