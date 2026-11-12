import mongoose from 'mongoose';
import User from '../models/user.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import emailService from '../utils/emailService.js';
import { validationResult } from 'express-validator';

const publicUserFields = 'name email role isActive createdAt updatedAt';

const createToken = (user) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
    }
    return jwt.sign(
        { id: user._id.toString(), name: user.name, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
};

const handleUserError = (res, error, operation) => {
    if (error.code === 11000) {
        return res.status(409).json({ message: 'A user with this email already exists' });
    }
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: error.message });
    }
    console.error(`Error ${operation}:`, error);
    return res.status(500).json({ message: `Error ${operation}` });
};

export const getUsers = async (req, res) => {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    if (page < 1 || limit < 1 || limit > 100) {
        return res.status(400).json({ message: 'page must be positive and limit must be between 1 and 100' });
    }
    try {
        const totalUsers = await User.countDocuments();
        const users = await User.find()
        .select(publicUserFields)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 });
        res.json({
            users,
            page,
            limit,
            total: totalUsers,
            totalPages: Math.ceil(totalUsers / limit),
        
        });
    } catch (error) {
        handleUserError(res, error, 'fetching users');
    }
};

export const getUser = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (req.userRole !== 'admin' && req.userId !== req.params.id) {
            return res.status(403).json({ message: 'Access denied' });
        }
        const user = await User.findById(req.params.id).select(publicUserFields);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        handleUserError(res, error, 'fetching user');
    }
};

export const createUser = async (req, res) => {
    const { name, email, password } = req.body;
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(422).json({ errors: errors.array() });
    }
    try {
        if (typeof name !== 'string' || !name.trim() ||
            typeof email !== 'string' ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ message: 'A valid name and email address are required' });
        }
        if (typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            name,
            email,
            password: hashedPassword,
            role: 'customer',
        });
        const token = createToken(newUser);
        try {
            await emailService.sendEmail({
                to: newUser.email,
                subject: 'Welcome to Helpdesk',
                text: `Hello ${newUser.name},\n\nYour Helpdesk account has been created successfully.`,
            });
        } catch (emailError) {
            console.error('Error sending registration email:', emailError);
        }
        res.status(201).json({ user: newUser.toJSON(), token });
    } catch (error) {
        handleUserError(res, error, 'creating user');
    }
};

export const updateUser = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: 'User not found' });
        }
        const allowedFields = ['role', 'isActive'];
        const updates = Object.fromEntries(
            allowedFields
                .filter((field) => Object.hasOwn(req.body, field))
                .map((field) => [field, req.body[field]])
        );
        if (!Object.keys(updates).length) {
            return res.status(400).json({ message: 'Provide a role or isActive value to update' });
        }
        if (updates.role !== undefined &&
            !['customer', 'agent', 'admin'].includes(updates.role)) {
            return res.status(400).json({ message: 'role must be customer, agent, or admin' });
        }
        if (updates.isActive !== undefined && typeof updates.isActive !== 'boolean') {
            return res.status(400).json({ message: 'isActive must be a boolean' });
        }
        const currentUser = await User.findById(req.params.id).select('role isActive');
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        const changesOwnAccess = req.userId === req.params.id &&
            (updates.isActive === false ||
                (updates.role !== undefined && updates.role !== currentUser.role));
        if (changesOwnAccess) {
            return res.status(403).json({ message: 'You cannot change your own role or deactivate your account' });
        }
        const removesActiveAdmin = currentUser.role === 'admin' &&
            currentUser.isActive &&
            (updates.isActive === false || (updates.role !== undefined && updates.role !== 'admin'));
        if (removesActiveAdmin) {
            const activeAdminCount = await User.countDocuments({ role: 'admin', isActive: true });
            if (activeAdminCount <= 1) {
                return res.status(409).json({ message: 'At least one active administrator must remain' });
            }
        }
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { returnDocument: 'after', runValidators: true, select: publicUserFields }
        );
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(updatedUser);
    } catch (error) {
        handleUserError(res, error, 'updating user');
    }
};

export const deleteUser = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (req.userId === req.params.id) {
            return res.status(403).json({ message: 'You cannot delete your own account' });
        }
        const userToDelete = await User.findById(req.params.id).select('role isActive');
        if (!userToDelete) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (userToDelete.role === 'admin' && userToDelete.isActive) {
            const activeAdminCount = await User.countDocuments({ role: 'admin', isActive: true });
            if (activeAdminCount <= 1) {
                return res.status(409).json({ message: 'At least one active administrator must remain' });
            }
        }
        const deletedUser = await User.findByIdAndDelete(req.params.id);
        if (!deletedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        handleUserError(res, error, 'deleting user');
    }
};

export const loginUser = async (req, res) => {
    const { email, password } = req.body;
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(422).json({ errors: errors.array() });
    }
    try {
        const user = await User.findOne({ email: String(email ?? '').trim().toLowerCase() })
            .select('+password');
        if (!user || !await bcrypt.compare(String(password ?? ''), user.password)) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        if (!user.isActive) {
            return res.status(403).json({ message: 'This account has been deactivated' });
        }
        const token = createToken(user);
        res.json({ user, token });
    } catch (error) {
        handleUserError(res, error, 'logging in');
    }
};
