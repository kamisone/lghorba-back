import { Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';

const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class GcsService {
  private readonly logger = new Logger(GcsService.name);
  private readonly storage: Storage;
  private readonly bucketName = process.env.GCS_BUCKET_NAME!;

  constructor() {
    this.storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        private_key_id: process.env.GCS_PRIVATE_KEY_ID,
      },
    });
  }

  async upload(
    buffer: Buffer,
    objectName: string,
    contentType: string,
    predefinedAcl?: 'publicRead' | 'private',
  ): Promise<void> {
    try {
      await this.storage.bucket(this.bucketName).file(objectName).save(buffer, {
        contentType,
        ...(predefinedAcl ? { predefinedAcl } : {}),
      });
    } catch (err: unknown) {
      this.logger.error(`GCS upload failed [${objectName}]: ${JSON.stringify(err)}`);
      throw err;
    }
  }

  async delete(objectName: string): Promise<void> {
    await this.storage.bucket(this.bucketName).file(objectName).delete({ ignoreNotFound: true });
  }

  async signedUrl(objectName: string): Promise<string> {
    const [url] = await this.storage
      .bucket(this.bucketName)
      .file(objectName)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + SIGNED_URL_TTL_MS,
      });
    return url;
  }

  /** Public CDN URL — only valid when the GCS object has allUsers:objectViewer IAM. */
  publicUrl(objectName: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${objectName}`;
  }
}
