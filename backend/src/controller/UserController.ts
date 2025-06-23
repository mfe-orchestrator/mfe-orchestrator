import UserRegistrationDTO from '../types/UserRegistrationDTO';
import UserLoginDTO from '../types/UserLoginDTO';
import ResetPasswordRequestDTO from '../types/ResetPasswordRequestDTO';
import ResetPasswordDataDTO from '../types/ResetPasswordDataDTO';
import { UserInvitationDTO } from '../types/UserInvitationDTO';
import { FastifyInstance } from 'fastify';
import UserService from '../service/UserService';

export function UserController(fastify: FastifyInstance) {

  const userService = new UserService();

  fastify.post<{
    Body: UserRegistrationDTO
  }>('/users/registration', { config: { public: true } },async (req, res) => {
    const out = await userService.register(req.body)
    return res.send(out.toFrontendObject());
  });

  fastify.post<{
    Body: UserLoginDTO
  }>('/users/login', { config: { public: true } }, async (req, res) => {
    return res.send(await userService.login(req.body));
  });

  fastify.post<{
    Body: ResetPasswordRequestDTO
  }>('/users/forgot-password', { config: { public: true } },async (req, res) => {
    await userService.requestPasswordReset(req.body.email);
    return res.send();
  });

  fastify.post<{
    Body: ResetPasswordDataDTO
  }>('/users/reset-password', { config: { public: true } },async (req, res) => {
    await userService.resetPassword(req.body);
    return res.send();
  });

  fastify.get('/users/profile', async (req, res) => {
    return res.send(await userService.getProfile(req.databaseUser._id));
  });

  fastify.post<{
    Body: UserInvitationDTO
  }>('/users/invitation', async (req, res) => {
    return res.send(await userService.inviteUser(req.body));
  });
};

export default UserController;
