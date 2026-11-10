import { Router } from 'express';
import { createUser, loginUser } from '../controllers/userController.js';
import { signUpValidation, loginValidation } from '../utils/validation.js';

const router = Router();

router.post('/register', signUpValidation(), createUser);
router.post('/login', loginValidation(), loginUser);

export default router;
