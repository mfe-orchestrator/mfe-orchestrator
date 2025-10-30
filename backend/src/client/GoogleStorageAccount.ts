import { Bucket, Storage } from "@google-cloud/storage"
import { Readable } from "stream"

export type AuthConfig =
    | {
          authType: "serviceAccount"
          projectId: string
          credentials: {
              client_email: string
              private_key: string
          }
      }
    | {
          authType: "apiKey"
          projectId: string
          apiKey: string
      }
    | {
          authType: "default"
          projectId: string
      }

export type GoogleStorageConfig = AuthConfig & {
    bucketName: string
}

export class GoogleStorageClient {
    private readonly storage: Storage
    private readonly bucket: Bucket
    private readonly projectId: string
    private readonly bucketName: string

    constructor(config: GoogleStorageConfig) {
        this.bucketName = config.bucketName
        this.projectId = config.projectId

        switch (config.authType) {
            case "serviceAccount":
                this.storage = new Storage({
                    projectId: config.projectId,
                    credentials: {
                        client_email: config.credentials.client_email,
                        private_key: config.credentials.private_key
                    }
                })
                break

            case "apiKey":
                this.storage = new Storage({
                    projectId: config.projectId,
                    keyFilename: config.apiKey
                })
                break

            case "default":
                this.storage = new Storage({
                    projectId: config.projectId
                })
                break

            default:
                throw new Error("Invalid authentication configuration")
        }

        this.bucket = this.storage.bucket(this.bucketName)
    }

    /**
     * Uploads a file to Google Cloud Storage
     * @param filePath The path (including filename) where the file should be stored in the bucket
     * @param fileContent The file content as a Buffer, string, or Readable stream
     * @param contentType The MIME type of the file (optional)
     * @returns The public URL of the uploaded file
     */
    public async uploadFile(filePath: string, fileContent: Buffer | string | Readable, contentType: string = "application/octet-stream"): Promise<string> {
        const file = this.bucket.file(filePath)
        const options = {
            metadata: {
                contentType
            },
            resumable: false
        }

        try {
            await new Promise<void>((resolve, reject) => {
                const stream = file.createWriteStream(options)

                stream.on("error", (error: Error) => {
                    reject(error)
                })

                stream.on("finish", () => {
                    resolve()
                })

                if (Buffer.isBuffer(fileContent) || typeof fileContent === "string") {
                    stream.end(fileContent)
                } else if (fileContent instanceof Readable) {
                    fileContent.pipe(stream)
                } else {
                    reject(new Error("Unsupported file content type"))
                }
            })

            // Make the file public (optional)
            await file.makePublic()

            return `https://storage.googleapis.com/${this.bucketName}/${encodeURIComponent(filePath)}`
        } catch (error: unknown) {
            console.error("Error uploading file to Google Cloud Storage:", error)
            const errorMessage = error instanceof Error ? error.message : String(error)
            throw new Error(`Failed to upload file: ${errorMessage}`)
        }
    }

    /**
     * Generates a signed URL for direct uploads from the client
     * @param filePath The path (including filename) where the file will be stored
     * @param expiresInMinutes URL expiration time in minutes (default: 60 minutes)
     * @returns A signed URL for direct uploads
     */
    public async getSignedUrl(filePath: string, expiresInMinutes: number = 60): Promise<string> {
        const file = this.bucket.file(filePath)
        const expires = Date.now() + expiresInMinutes * 60 * 1000

        try {
            const [url] = await file.getSignedUrl({
                action: "write",
                expires,
                contentType: "application/octet-stream"
            })

            return url
        } catch (error: unknown) {
            console.error("Error generating signed URL:", error)
            const errorMessage = error instanceof Error ? error.message : String(error)
            throw new Error(`Failed to generate signed URL: ${errorMessage}`)
        }
    }

    /**
     * Deletes a file from the bucket
     * @param filePath The path to the file to delete
     */
    public async deleteFile(filePath: string): Promise<void> {
        const file = this.bucket.file(filePath)

        try {
            await file.delete()
        } catch (error: unknown) {
            console.error("Error deleting file from Google Cloud Storage:", error)
            const errorMessage = error instanceof Error ? error.message : String(error)
            throw new Error(`Failed to delete file: ${errorMessage}`)
        }
    }
}

export default GoogleStorageClient
