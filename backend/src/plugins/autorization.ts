import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

// export const userHasGrants = (requiredGrants?: string[], userGrants?: string[]) => {
//   if (!requiredGrants) return true;
//   if (!userGrants) return false;
//   return requiredGrants.some(grant => userGrants.includes(grant));
// };

// const getUserFromAuth0 = async (fastify: FastifyInstance, userId: string, token: string): Promise<Auth0UserDTO> => {
//   //Looking into cache
//   let userFromCache = null
//   if(fastify.redis !== undefined){
//     userFromCache = await fastify.redis.get(userId);
//   }
//   if (userFromCache) return JSON.parse(userFromCache);
//   // user is not in cache, looking into auth0
//   const response = await axios.get(`https://${fastify.config.AUTH0_DOMAIN}/userinfo`, {
//     headers: {
//       Authorization: `Bearer ${token}`,
//     },
//   });

//   try {
//     if (fastify.redis !== undefined) {
//       // Setting user in cache
//       await fastify.redis.set(userId, JSON.stringify(response.data));
//     }else{
//       fastify.log.error("Redis not defined, unable to set user in cache")
//     }
//   } catch (e) {
//     fastify.log.error(e);
//   }
//   return response.data;
// };

export default fastifyPlugin(
  async (fastify: FastifyInstance) => {
    // fastify.addHook('preHandler', async (request, response) => {
    //   if (request.routeOptions.config.public || request.routeOptions.url?.startsWith('/api-docs')) {
    //     return;
    //   }
    //   fastify.log.debug('Pre handler login ok');
    //   const authToken = request?.headers?.['authorization']?.replace('Bearer ', '');
    //   fastify.log.debug('Auth token', authToken);
    //   if (!authToken) {
    //     throw new AuthenticationError('Missing or invalid Authorization header');
    //   }
    //   await fastify.authenticate(request, response);
    //   if (!request.user) {
    //     throw new AuthenticationError('User not found');
    //   }

    //   const userFromAuth0 = await getUserFromAuth0(fastify, (request.user as any).sub, authToken);
    //   request.auth0user = userFromAuth0;

    //   //console.log(userAuth0)

    //   const user = await UserRepository.getUserByEmail(userFromAuth0.email);
    //   if (!user) {
    //     throw new AuthenticationError(
    //       'User found in authentication provider but not in database with email ' + userFromAuth0.email
    //     );
    //   }
    //   request.databaseUser = {
    //     ...user,
    //     grants: user.grants ? JSON.parse(user.grants) : [],
    //   };

    //   if (!userHasGrants(request.routeOptions.config.grants, request.databaseUser.grants)) {
    //     throw new AuthorizationError('User does not have required grants', request.routeOptions.config.grants);
    //   }
    // });
  },
  { name: 'authorization', dependencies: ['config'] }
);
