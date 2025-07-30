import nodemailer from 'nodemailer';
import { fastify } from '..';

class EmailSenderService {
  private transporter: nodemailer.Transporter;
  private config: any;
  private canSendEmail = false;

  constructor() {
    this.config = fastify.config;
    if(!this.config || !this.config?.EMAIL_SMTP_HOST){
      this.canSendEmail = false;
      this.transporter = nodemailer.createTransport({})
    }else{
      this.canSendEmail = true;
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

  canSendEmails() : boolean{
      return this.canSendEmail;
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

  async sendVerificationEmail(email : string, token : string) : Promise<void>{
    const resetUrl = `${this.config.FRONTEND_URL}/account-activation/${token}`;

    const mailOptions = {
      from: this.config.EMAIL_SMTP_FROM,
      to: email,
      subject: 'Account Activation',
      html: `
        <h2>Account Activation</h2>
        <p>You are receiving this email because you have requested an account activation.</p>
        <p>Please click on the following link to activate your account:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you did not request this, please ignore this email and your account will not be activated.</p>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendInvitationEmail(email: string, invitationLink: string, projectName: string): Promise<void> {
    const mailOptions = {
      from: this.config.EMAIL_SMTP_FROM,
      to: email,
      subject: `Invitation to join ${projectName}`,
      html: `
        <h2>Invitation to Join ${projectName}</h2>
        <p>You have been invited to join ${projectName}.</p>
        <p>Please click on the following link to accept the invitation:</p>
        <p><a href="${invitationLink}">${invitationLink}</a></p>
        <p>If you did not request this invitation, please ignore this email.</p>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }
}

export default EmailSenderService