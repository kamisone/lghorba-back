import {
  Column, Entity, ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { Inspection } from './inspection.entity';

export type ChecklistItemStatus = 'ok' | 'issue' | 'not_checked';

@Entity('inspection_checklist_items')
export class InspectionChecklistItem {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  inspectionId: string;

  @ManyToOne(() => Inspection, (i) => i.checklistItems, { onDelete: 'CASCADE' })
  inspection: Relation<Inspection>;

  @Column({ type: 'varchar', length: 100 })
  category: string;

  @Column({ type: 'varchar', length: 300 })
  itemLabel: string;

  @Column({ type: 'varchar', length: 20, default: 'not_checked' })
  status: ChecklistItemStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'smallint', default: 0 })
  sortOrder: number;
}
