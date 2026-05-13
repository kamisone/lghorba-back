import { BadRequestException } from '@nestjs/common';
import { BookingStatus } from './booking.entity';

export const VALID_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  [BookingStatus.PENDING_PAYMENT]:           [BookingStatus.CONFIRMED, BookingStatus.CANCELLED, BookingStatus.CANCELLED_PAYMENT_TIMEOUT],
  [BookingStatus.PENDING]:                   [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]:                 [BookingStatus.CANCELLED],
  [BookingStatus.CANCELLED]:                 [],
  [BookingStatus.CANCELLED_PAYMENT_TIMEOUT]: [],
};

export function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return true;
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

export function assertValidTransition(from: BookingStatus, to: BookingStatus): void {
  if (!isValidTransition(from, to)) {
    throw new BadRequestException(`Invalid status transition: ${from} → ${to}`);
  }
}
