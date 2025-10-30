import { PutObjectCommand, PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Readable } from "stream"

export interface S3ClientConfig {
    region: string
    accessKeyId: string
    secretAccessKey: string
    bucketName: string
}

export class S3BucketClient {
    private readonly s3Client: S3Client
    private readonly bucketName: string

    constructor(config: S3ClientConfig) {
        this.bucketName = config.bucketName

        this.s3Client = new S3Client({
            region: config.region,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            }
        })
    }

    /**
     * Uploads a file to the specified S3 path
     * @param filePath The path (including filename) where the file should be stored in the bucket
     * @param fileContent The file content as a Buffer, string, or Readable stream
     * @param contentType The MIME type of the file (optional)
     * @returns The URL of the uploaded file
     */
    public async uploadFile(filePath: string, fileContent: Buffer | string | Readable, contentType?: string): Promise<string> {
        const params: PutObjectCommandInput = {
            Bucket: this.bucketName,
            Key: filePath,
            Body: fileContent
        }

        if (contentType) {
            params.ContentType = contentType
        }

        const command = new PutObjectCommand(params)

        try {
            await this.s3Client.send(command)
            return `https://${this.bucketName}.s3.amazonaws.com/${encodeURIComponent(filePath)}`
        } catch (error: unknown) {
            console.error("Error uploading file to S3:", error)
            const errorMessage = error instanceof Error ? error.message : String(error)
            throw new Error(`Failed to upload file to S3: ${errorMessage}`)
        }
    }

    /**
     * Generates a pre-signed URL for direct uploads from the client
     * @param filePath The path (including filename) where the file will be stored
     * @param expiresIn URL expiration time in seconds (default: 3600 - 1 hour)
     * @returns A pre-signed URL for direct uploads
     */
    public async getPresignedUploadUrl(filePath: string, expiresIn = 3600): Promise<string> {
        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: filePath
        })

        try {
            return await getSignedUrl(this.s3Client, command, { expiresIn })
        } catch (error: unknown) {
            console.error("Error generating pre-signed URL:", error)
            const errorMessage = error instanceof Error ? error.message : String(error)
            throw new Error(`Failed to generate pre-signed URL: ${errorMessage}`)
        }
    }
}

export default S3BucketClient
