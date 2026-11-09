import { Router } from 'express';
import { getUser, createUser, updateUser, deleteUser, loginUser } from '../controllers/userController.js';

const router = Router();

// Define routes for user operations    
router.get('/:id', getUser); // Get user by ID
router.post('/signup', createUser); // Create a new user
router.put('/:id', updateUser); // Update user by ID
router.delete('/:id', deleteUser); // Delete user by ID
// router.post('/reset-password', resetPassword); // Reset user password
// router.post('/forgot-password', forgotPassword); // Handle forgot password request
router.post('/login', loginUser); // User login route

export default router;