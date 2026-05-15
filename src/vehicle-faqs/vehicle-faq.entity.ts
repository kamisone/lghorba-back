import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('vehicle_faqs')
@Index('IDX_vehicle_faqs_entity', ['entityType', 'entityId', 'position'])
export class VehicleFaq {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Generic entity reference — 'car' today, extensible to other entity types later.
  @Column({ type: 'varchar', length: 64 })
  entityType: string;

  @Column({ type: 'uuid' })
  entityId: string;

  @Column({ type: 'int', default: 0 })
  position: number;

  @Column({ type: 'boolean', default: true })
  isVisible: boolean;

  // FR canonical content — EN (and future locales) live in the translations table.
  // entityType='vehicle_faq', fields: 'question' | 'answer'
  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
