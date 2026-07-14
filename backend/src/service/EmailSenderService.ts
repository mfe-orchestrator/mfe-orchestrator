import nodemailer from "nodemailer"
import path from "path"
import pug from "pug"
import { fastify } from ".."
import { IProject } from "../models/ProjectModel"
import { IUser } from "../models/UserModel"
import { RoleInProject } from "../models/UserProjectModel"

class EmailSenderService {
    private transporter: nodemailer.Transporter
    // biome-ignore lint/suspicious/noExplicitAny: Config object has dynamic properties
    private config: any
    private canSendEmail = false

    constructor() {
        this.config = fastify.config
        if (!this.config || !this.config?.EMAIL_SMTP_HOST) {
            this.canSendEmail = false
            this.transporter = nodemailer.createTransport({})
        } else {
            this.canSendEmail = true
            this.transporter = nodemailer.createTransport({
                host: this.config.EMAIL_SMTP_HOST,
                port: this.config.EMAIL_SMTP_PORT,
                secure: this.config.EMAIL_SMTP_SECURE,
                auth: {
                    user: this.config.EMAIL_SMTP_USER,
                    pass: this.config.EMAIL_SMTP_PASSWORD
                }
            })
        }
    }

    canSendEmails(): boolean {
        return this.canSendEmail
    }

    async sendUserInvitationEmail(user: IUser, project: IProject, role: RoleInProject, token: string) {
        const acceptUrl = `${this.config.FRONTEND_URL}/project-invitation/${token}`

        // Compile the Pug template
        const emailHtml = pug.renderFile(path.join(__dirname, "../templates/emails/project-invitation.pug"), {
            user,
            project,
            role: this.formatRoleName(role),
            acceptUrl,
            header: "You're Invited!",
            headerIcon: "👋",
            footerText: "This invitation link will expire in 5 days."
        })

        const mailOptions = {
            from: this.config.EMAIL_SMTP_FROM,
            to: user.email,
            subject: `🎉 You're invited to join ${project.name}`,
            html: emailHtml
        }

        await this.transporter.sendMail(mailOptions)
    }

    private formatRoleName(role: RoleInProject): string {
        return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
    }

    async sendResetPasswordEmail(email: string, token: string): Promise<void> {
        const resetUrl = `${this.config.FRONTEND_URL}/reset-password/${token}`

        // Compile the Pug template
        const emailHtml = pug.renderFile(path.join(__dirname, "../templates/emails/password-reset.pug"), {
            resetUrl,
            header: "Reset Your Password",
            headerIcon: "🔑",
            footerText: "This password reset link will expire in 1 hour."
        })

        const mailOptions = {
            from: this.config.EMAIL_SMTP_FROM,
            to: email,
            subject: "🔑 Reset Your Password",
            html: emailHtml
        }

        await this.transporter.sendMail(mailOptions)
    }

    async sendVerificationEmail(email: string, token: string): Promise<void> {
        const activationUrl = `${this.config.FRONTEND_URL}/account-activation/${token}`

        // Compile the Pug template
        const emailHtml = pug.renderFile(path.join(__dirname, "../templates/emails/account-activation.pug"), {
            activationUrl,
            header: "Welcome Aboard!",
            headerIcon: "🎉",
            footerText: "This activation link will expire in 24 hours."
        })

        const mailOptions = {
            from: this.config.EMAIL_SMTP_FROM,
            to: email,
            subject: "🎉 Activate Your Account",
            html: emailHtml
        }

        await this.transporter.sendMail(mailOptions)
    }
}

export default EmailSenderService
