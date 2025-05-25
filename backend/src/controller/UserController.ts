import userService from '../service/UserService';
import UserRegistrationDTO from '../types/UserRegistrationDTO';
import UserLoginDTO from '../types/UserLoginDTO';
import ResetPasswordRequestDTO from '../types/ResetPasswordRequestDTO';
import ResetPasswordDataDTO from '../types/ResetPasswordDataDTO';
import { UserInvitationDTO } from '../types/UserInvitationDTO';
import { FastifyInstance } from 'fastify';

export function UserController(fastify: FastifyInstance) {

  fastify.post<{
    Body: UserRegistrationDTO
  }>('/users/registration', async (req, res) => {
    return res.send(await userService.register(req.body));
  });

  fastify.post<{
    Body: UserLoginDTO
  }>('/users/login', async (req, res) => {
    return res.send(await userService.login(req.body));
  });

  fastify.post<{
    Body: ResetPasswordRequestDTO
  }>('/users/forgot-password', async (req, res) => {
    await userService.requestPasswordReset(req.body.email);
    return res.send();
  });

  fastify.post<{
    Body: ResetPasswordDataDTO
  }>('/users/reset-password', async (req, res) => {
    await userService.resetPassword(req.body);
    return res.send();
  });

  fastify.get('/users/profile', async (req, res) => {
    return res.send(await userService.getProfile("TODO DEVO METTERLO"));
  });

  fastify.post<{
    Body: UserInvitationDTO
  }>('/users/invitation', async (req, res) => {
    return res.send(await userService.inviteUser(req.body));
  });
};

export default UserController;
