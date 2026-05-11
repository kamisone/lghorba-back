export const BOOKING_REMINDER_QUEUE = 'booking-reminder';
export const BOOKING_REMINDER_SETTINGS_KEY = 'booking_reminder';

export const DEFAULT_SMS_TEMPLATE =
  `[RAPPEL] Réservation dans {{minutesBefore}}min\n` +
  `Client : {{customerName}} | {{customerPhone}}\n` +
  `Véhicule : {{carDetails}}\n` +
  `Source : {{source}}\n` +
  `Début : {{startDateTime}}\n` +
  `Fin : {{endDateTime}}\n` +
  `Prix : {{totalPrice}}€\n` +
  `Réf : {{reservationId}}`;

export const DEFAULT_EMAIL_SUBJECT =
  `[Rappel] Réservation {{carDetails}} – {{startDateTime}}`;

export const DEFAULT_EMAIL_TEMPLATE =
  `Rappel de réservation dans {{minutesBefore}} minutes.\n\n` +
  `Client : {{customerName}} ({{customerPhone}})\n` +
  `Véhicule : {{carDetails}}\n` +
  `Source : {{source}}\n` +
  `Début : {{startDateTime}}\n` +
  `Fin : {{endDateTime}}\n` +
  `Lieu : {{location}}\n` +
  `Prix : {{totalPrice}} €\n` +
  `Référence : {{reservationId}}`;
