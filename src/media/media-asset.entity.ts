import {
  Column, CreateDateColumn, Entity, Index, OneToMany,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('media_assets')
@Index(['mimeType'])
@Index(['createdAt'])
export class MediaAsset {
  @PrimaryGeneratedColumn('uuid') id: string;

  /** GCS object path, e.g. "media/2024/01/abc123.jpg" */
  @Column({ type: 'varchar', length: 1000, unique: true }) storageKey: string;

  @Column({ type: 'varchar', length: 500 })             originalFilename: string;
  @Column({ type: 'varchar', length: 100 })             mimeType: string;
  @Column({ type: 'int' })                              sizeBytes: number;

  @Column({ type: 'int', nullable: true })              width:  number | null;
  @Column({ type: 'int', nullable: true })              height: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true }) altText: string | null;

  /** Free-form tags for organization */
  @Column({ type: 'text', array: true, default: '{}' }) tags: string[];

  /** SHA-256 hex of the file — enables dedup detection */
  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index()
  checksum: string | null;

  /** Admin user ID who uploaded (loose reference, no FK — admin may be deleted) */
  @Column({ type: 'varchar', length: 200, nullable: true }) uploadedBy: string | null;

  @Column({ name: 'folder_id', type: 'uuid', nullable: true })
  @Index()
  folderId: string | null;

  // String reference avoids circular import with media-usage.entity.ts
  @OneToMany('MediaUsage', 'asset')
  usages: any[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
