import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { RentSchedule } from '../cars/rent-schedule.entity';

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

  @OneToMany(() => RentSchedule, (s) => s.user)
  rentSchedules: RentSchedule[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
