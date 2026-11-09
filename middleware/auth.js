import jwt from 'jsonwebtoken';
import User from '../models/user.js';

export const requireAuth = async (req, res, next) => {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    try {
        const tokenUser = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(tokenUser.id).select('role isActive');
        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'User account is inactive or no longer exists' });
        }
        req.userId = user._id.toString();
        req.userRole = user.role;
        next();
    } catch (error) {
        if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') {
            return next(error);
        }
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

export const requireRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.userRole)) {
        return res.status(403).json({ message: 'Access denied' });
    }
    next();
};

export const requireAdmin = [requireAuth, requireRole('admin')];
