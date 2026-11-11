import  { check, body } from 'express-validator'
import User from '../models/user.js'
export const loginValidation = () =>{
    return [
        check('email')
        .isEmail()
        .withMessage('Please enter the valid email')
        .trim(),
        body('password', 'Password should be 5 char long.')
        .isLength({ min: 5}).trim()
    ]
}

export const signUpValidation = () =>{
    return  [
            check('name')
            .matches(/^[A-Za-z ]+$/)
            .isLength({ min: 5 })
            .withMessage('Name must contain only letters and spaces and it should be min 5 char in length')
            .trim(),
            check('email')
            .isEmail()
            .withMessage('Please enter the valid email')
                .custom((value, {req}) =>{
                    // if(value === 'test@test.com'){
                    //     throw new Error('This email is forbidden')
                    // }
                    // return true
                    return User.findOne({ email: value }).then(user =>{
                        if(user){
                        return Promise.reject('Email already exist')
                        }
                        return true
                    })
                }).trim(),
            body('password', 'Password should be 5 character in length.')
            .isLength({ min: 5}).trim(),
            body('confirmPassword')
            .custom((value, {req})=>{
                if(value !== req.body.password){
                    throw new Error('Confirm Password and Password should match')
                }
                return true
            }).trim()
        ]
}

export const addEditTicket = () => {
    return [
        body('title', 'Please enter a valid title')
        .matches(/^[A-Za-z ]+$/)
        .isLength({ min : 5})
        .trim(),
        body('description', "Please enter a valid description")
        .isString()
        .trim(),
        body('priority', 'Please select a valid priority')
        .isIn(['low', 'medium', 'high', 'urgent'])
        .trim(),
        body('category', 'Please select a valid category')
        .isString()
        .notEmpty()
    ] 
}