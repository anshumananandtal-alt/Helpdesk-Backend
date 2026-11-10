import nodemailer from 'nodemailer';
import sendGridTransporter from 'nodemailer-sendgrid-transport';

const transporter = nodemailer.createTransport(sendGridTransporter({
    auth: {
        api_key: process.env.SEND_GRID_KEY,
    },
}));

const sendEmail = async ({ to, subject, text }) => {
    if (!process.env.SEND_GRID_KEY) {
        throw new Error('SEND_GRID_KEY is not configured');
    }
    if (!process.env.EMAIL_FROM) {
        throw new Error('EMAIL_FROM is not configured');
    }

    return transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        text,
    });
};

export default { sendEmail };
