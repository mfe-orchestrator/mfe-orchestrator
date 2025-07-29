import nodemailer from 'nodemailer';
import { FastifyInstance } from 'fastify';

class EmailSenderService {
  private transporter: nodemailer.Transporter;
  private config: any;

  constructor(fastify?: FastifyInstance) {
    this.config = fastify?.config;
    if(!this.config){
      this.transporter = nodemailer.createTransport({})
    }else{
      console.log(this.config)
      this.transporter = nodemailer.createTransport({
        host: this.config.EMAIL_SMTP_HOST,
        port: this.config.EMAIL_SMTP_PORT,
        secure: this.config.EMAIL_SMTP_SECURE,
        auth: {
          user: this.config.EMAIL_SMTP_USER,
          pass: this.config.EMAIL_SMTP_PASSWORD
        }
      });
    }
  }

  async sendResetPasswordEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.config.FRONTEND_URL}/reset-password/${token}`;

    const mailOptions = {
      from: this.config.EMAIL_SMTP_FROM,
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

    await this.transporter.sendMail(mailOptions);
  }

  async sendInvitationEmail(email: string, invitationLink: string, organizationName: string): Promise<void> {
    const mailOptions = {
      from: this.config.EMAIL_SMTP_FROM,
      to: email,
      subject: `Invitation to join ${organizationName}`,
      html: `
        <h2>Invitation to Join ${organizationName}</h2>
        <p>You have been invited to join ${organizationName}.</p>
        <p>Please click on the following link to accept the invitation:</p>
        <p><a href="${invitationLink}">${invitationLink}</a></p>
        <p>If you did not request this invitation, please ignore this email.</p>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }
}

export default EmailSenderService