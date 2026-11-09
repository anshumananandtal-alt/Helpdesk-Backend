import mongoose from "mongoose";

const userSchema = new mongoose.Schema({  
    name: {
        type: String,
        required: true  
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: true,
        select: false,
    },
    role: {
        type: String,   
        enum: ['admin', 'customer', 'agent'],
        default: 'customer'
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

userSchema.set('toJSON', {
    transform(document, result) {
        delete result.password;
        delete result.__v;
        return result;
    },
});

const User = mongoose.model('User', userSchema);

export default User;
