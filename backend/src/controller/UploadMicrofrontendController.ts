import { FastifyInstance } from 'fastify';
import { MicrofrontendUploadDTO } from '../types/MicrofrontendDTO';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { FastifyMultipartFile } from '@fastify/multipart';
import { FastifyRequest, FastifyReply } from 'fastify';
import { FastifyTypeProviderDefault } from 'fastify/types/type-provider';
import { FastifyBaseLogger } from 'fastify/types/logger';
import { RouteGenericInterface } from 'fastify/types/route';
import { FastifySchema } from 'fastify/types/schema';
import { FastifyRequestWithConfig, FastifyReplyWithConfig } from '../types';
import { IncomingMessage } from 'http';
import { FastifyInstanceWithConfig } from '../types';
import { FastifyMultipartRequest } from '@fastify/multipart';

const pipelineAsync = promisify(pipeline);
const execAsync = promisify(exec);

export default async function uploadMicrofrontendController(fastify: FastifyInstanceWithConfig) {
  fastify.register(require('@fastify/multipart'), {
    attachFieldsToBody: true,
    limits: {
      fieldNameSize: 100, // Max field name size
      fieldSize: 1000000, // Max field value size
      fields: 10, // Max number of non-file fields
      fileSize: 10000000, // Max file size
      files: 1, // Max number of files
      headerPairs: 2000 // Max number of header key=>value pairs
    }
  });

  fastify.post<{ Body: MicrofrontendUploadDTO; File: FastifyMultipartFile; }>('microfrontends/upload', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'version'],
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          description: { type: 'string' },
          author: { type: 'string' },
          main: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { name, version } = request.body;
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      if (!file) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      // Generate unique filename
      const uploadDir = join(__dirname, '../../uploads');
      const fileName = `${name}-${version}-${uuidv4()}.zip`;
      const filePath = join(uploadDir, fileName);

      // Create upload directory if it doesn't exist
      await utilPromisify(require('node:fs').mkdir)(uploadDir, { recursive: true });

      // Save the uploaded file
      await pipelineAsync(
        file.file,
        createWriteStream(filePath)
      );

      // Extract zip file
      await execAsync(`unzip -o ${filePath} -d ${uploadDir}/${name}-${version}`);

      // Validate package.json
      const packageJsonPath = join(uploadDir, `${name}-${version}`, 'package.json');
      const packageJson = require(packageJsonPath);

      if (!packageJson.name || !packageJson.version) {
        throw new Error('Invalid package.json');
      }

      return {
        message: 'Microfrontend uploaded successfully',
        details: {
          name: packageJson.name,
          version: packageJson.version,
          uploadedAt: new Date().toISOString()
        }
      };
    } catch (error: unknown) {
      console.error('Upload error:', error);
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Unknown error occurred' });
    }
  });
}