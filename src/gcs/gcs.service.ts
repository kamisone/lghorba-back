import { Injectable } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';

const SIGNED_URL_TTL_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class GcsService {
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

  async upload(buffer: Buffer, objectName: string, contentType: string): Promise<void> {
    await this.storage.bucket(this.bucketName).file(objectName).save(buffer, { contentType });
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
}
