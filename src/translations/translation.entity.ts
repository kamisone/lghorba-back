import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('translations')
@Unique(['entityType', 'entityId', 'field', 'lang'])
export class Translation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  entityType: string;

  @Column({ type: 'varchar' })
  entityId: string;

  @Column({ type: 'varchar', length: 100 })
  field: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'varchar', length: 10 })
  lang: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
