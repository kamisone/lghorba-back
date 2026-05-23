import {
  Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { MediaAsset } from './media-asset.entity';

export type MediaEntityType =
  | 'product' | 'product_variant' | 'blog_post'
  | 'collection' | 'promotion' | 'vendor' | 'other';

@Entity('media_usages')
@Index(['assetId'])
@Index(['entityType', 'entityId'])
export class MediaUsage {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) assetId: string;

  @ManyToOne(() => MediaAsset, a => a.usages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset: Relation<MediaAsset>;

  /** Loosely typed entity reference — no FK to keep it decoupled */
  @Column({ type: 'varchar', length: 100 }) entityType: MediaEntityType;
  @Column({ type: 'uuid' })                 entityId:   string;

  /** Which field on the entity uses this asset, e.g. "featuredImage", "gallery" */
  @Column({ type: 'varchar', length: 100 }) field: string;

  @CreateDateColumn() createdAt: Date;
}
