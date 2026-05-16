import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('users')
@Unique(['name', 'phone'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'int', nullable: true })
  score: number | null;

  @Column({ type: 'date', nullable: true })
  turoJoinDate: string | null;

  @Column({ type: 'date', nullable: true })
  getaroundJoinDate: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  platformProfileUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
