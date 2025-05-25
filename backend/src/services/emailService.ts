import nodemailer from 'nodemailer';
import { FastifyInstance } from 'fastify';

export const sendResetPasswordEmail = async (fastify: FastifyInstance, email: string, token: string) => {
  const config = fastify.config;
  const transporter = nodemailer.createTransport({
    host: config.EMAIL_HOST,
    port: config.EMAIL_PORT,
    secure: config.EMAIL_SECURE,
    auth: {
      user: config.EMAIL_USER,
      pass: config.EMAIL_PASS
    }
  });

  const resetUrl = `${config.FRONTEND_URL}/reset-password/${token}`;

  const mailOptions = {
    from: config.EMAIL_FROM,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <h2>Password Reset</h2>
      <p>You are receiving this email because you have requested a password reset.</p>
      <p>Please click on the following link to reset your password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};
