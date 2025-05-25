import { User } from '../models/UserModel';
import { randomBytes } from 'crypto';
import { sendResetPasswordEmail } from '../services/emailService';
import { FastifyInstanceWithConfig, FastifyRequestWithUser } from '../types';
import UserRegistrationDTO from '../types/UserRegistrationDTO';
import UserLoginDTO from '../types/UserLoginDTO';

interface ResetPasswordRequest {
  email: string;
}

interface ResetPasswordData {
  token: string;
  password: string;
}

function UserController(fastify: FastifyInstanceWithConfig) {

  fastify.post<{
    Body: UserRegistrationDTO
  }>('/users/registration', async (req, res) => {
    try {
      const { email, password, name, surname } = req.body;
      
      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).send({ error: 'User already exists' });
      }

      // Create new user
      const user = new User({
        email,
        password,
        name,
        surname
      });

      await user.save();
      return res.status(201).send({ message: 'User registered successfully' });
    } catch (error) {
      return res.status(500).send({ error: 'Error registering user' });
    }
  });

  // Login user
  fastify.post<{
    Body: UserLoginDTO
  }>('/users/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).send({ error: 'Invalid credentials' });
      }

      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        return res.status(401).send({ error: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = fastify.jwt.sign({ id: user._id });
      return res.send({ token, user: { name: user.name, surname: user.surname } });
    } catch (error) {
      return res.status(500).send({ error: 'Error logging in' });
    }
  });

  // Get current user
  fastify.get('/users/me', { 
    preHandler: fastify.authenticate 
  }, async (req: FastifyRequestWithUser, res) => {
    try {
      const user = req.user;
      return res.send({
        id: user._id,
        email: user.email,
        name: user.name,
        surname: user.surname
      });
    } catch (error) {
      return res.status(500).send({ error: 'Error fetching user' });
    }
  });

  // Request password reset
  fastify.post<{
    Body: ResetPasswordRequest
  }>('/users/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).send({ error: 'User not found' });
      }

      // Generate reset token
      const resetToken = randomBytes(32).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
      await user.save();

      // Send reset password email
      await sendResetPasswordEmail(fastify, user.email, resetToken);

      return res.send({ message: 'Password reset email sent' });
    } catch (error) {
      return res.status(500).send({ error: 'Error sending reset password email' });
    }
  });

  // Reset password
  fastify.post<{
    Body: ResetPasswordData
  }>('/users/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;
      
      const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).send({ error: 'Invalid or expired token' });
      }

      // Update password
      user.password = password;
      user.resetPasswordToken = '';
      user.resetPasswordExpires = null;
      await user.save();

      return res.send({ message: 'Password reset successfully' });
    } catch (error) {
      return res.status(500).send({ error: 'Error resetting password' });
    }
  });
}
  // Register new user
  fastify.post('/users/register', async (req, res) => {
    try {
      const { email, password, name, surname } = req.body;
      
      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).send({ error: 'User already exists' });
      }

      // Create new user
      const user = new User({
        email,
        password,
        name,
        surname
      });

      await user.save();
      return res.status(201).send({ message: 'User registered successfully' });
    } catch (error) {
      return res.status(500).send({ error: 'Error registering user' });
    }
  });

  // Login user
  fastify.post('/users/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).send({ error: 'Invalid credentials' });
      }

      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        return res.status(401).send({ error: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = fastify.jwt.sign({ id: user._id });
      return res.send({ token, user: { name: user.name, surname: user.surname } });
    } catch (error) {
      return res.status(500).send({ error: 'Error logging in' });
    }
  });

  // Get current user
  fastify.get('/users/me', { 
    preHandler: fastify.auth([fastify.authenticate]) 
  }, async (req, res) => {
    try {
      const user = req.user as any;
      return res.send({
        id: user._id,
        email: user.email,
        name: user.name,
        surname: user.surname
      });
    } catch (error) {
      return res.status(500).send({ error: 'Error fetching user' });
    }
  });

  // Request password reset
  fastify.post('/users/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).send({ error: 'User not found' });
      }

      // Generate reset token
      const resetToken = randomBytes(32).toString('hex');
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
      await user.save();

      // Send reset password email
      await sendResetPasswordEmail(user.email, resetToken);

      return res.send({ message: 'Password reset email sent' });
    } catch (error) {
      return res.status(500).send({ error: 'Error sending reset password email' });
    }
  });

  // Reset password
  fastify.post('/users/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;
      
      const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).send({ error: 'Invalid or expired token' });
      }

      // Update password
      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      return res.send({ message: 'Password reset successfully' });
    } catch (error) {
      return res.status(500).send({ error: 'Error resetting password' });
    }
  });
};

export default UserController;
