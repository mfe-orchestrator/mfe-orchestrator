import User, { IUserDocument } from '../models/UserModel';
import { UserAlreadyExistsError } from '../errors/UserAlreadyExistsError';
import { UserNotFoundError } from '../errors/UserNotFoundError';
import { InvalidCredentialsError } from '../errors/InvalidCredentialsError';
import UserRegistrationDTO from '../types/UserRegistrationDTO';
import UserLoginDTO from '../types/UserLoginDTO';
import ResetPasswordDataDTO from '../types/ResetPasswordDataDTO';
import { UserInvitationDTO } from '../types/UserInvitationDTO';
import { randomBytes } from 'crypto';
import EmailService from './EmailSenderService';
import AuthenticationError from '../errors/AuthenticationError';

export class UserService {
  private emailService: EmailService;

  constructor(emailService?: EmailService) {
    this.emailService = emailService || new EmailService();
  }

  async register(userData: UserRegistrationDTO) {
    const { email, password, name, surname } = userData;
    const existingUser = await User.findOne({ email });
    
    if (existingUser) {
      throw new UserAlreadyExistsError(email);
    }

    const user = new User({
      email,
      password,
      name,
      surname
    });

    await user.save();
    return user;
  }

  async existsAtLeastOneUser() {
    const users = await User.find()
    return users.length > 0;
  }

  async login(loginData: UserLoginDTO) {
    const { email, password } = loginData;
    const user = await User.findOne({ email });

    if(!user?.password){
      throw new AuthenticationError("This email is associated to an account created with an external provider")
    }

    if (!user) {
      throw new UserNotFoundError(email);
    }

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      throw new InvalidCredentialsError();
    }

    return {
      user: user.toFrontendObject(),
      ...user.generateAuthToken()
    }
  }

  async inviteUser(invitationData: UserInvitationDTO) {
    const { email, name, surname, role } = invitationData;
    const existingUser = await User.findOne({ email });
    
    if (existingUser) {
      throw new UserAlreadyExistsError(email);
    }

    // Generate a temporary password for the new user
    const tempPassword = randomBytes(16).toString('hex');
    
    const user = new User({
      email,
      password: tempPassword,
      name,
      surname,
      role,
      isInvited: true,
      salt: tempPassword // We need to set the salt for password hashing
    }) as IUserDocument;

    await user.save();
    return user;
  }

  async requestPasswordReset(email: string) {
    const user = await User.findOne({ email });
    if (!user) {
      throw new UserNotFoundError(email);
    }

    const resetToken = randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    await this.emailService.sendResetPasswordEmail(email, resetToken);
  }

  async resetPassword(data: ResetPasswordDataDTO) {
    const { token, password } = data;
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      throw new Error('Invalid or expired token');
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
  }

  async getProfile(id: string) {
    const user = await User.findOne({ _id: id });
    if (!user) {
      throw new Error('Invalid token');
    }

    return {
      email: user.email,
      name: user.name,
      surname: user.surname
    };
  }
}

export default UserService;
