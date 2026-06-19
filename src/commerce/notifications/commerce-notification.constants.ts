export const COMMERCE_NOTIF_QUEUE = 'commerce-admin-notification';

export const COMMERCE_NOTIF_KEYS = {
  smsEnabled:    'commerce_notif_sms_enabled',
  smsPhones:     'commerce_notif_sms_phones',
  emailEnabled:  'commerce_notif_email_enabled',
  emailAddresses:'commerce_notif_email_addresses',
  events:        'commerce_notif_events',
} as const;

export const COMMERCE_NOTIF_DEFAULTS = {
  smsEnabled:     false,
  smsPhones:      [] as string[],
  emailEnabled:   false,
  emailAddresses: [] as string[],
  events:         ['payment_succeeded', 'order_cancelled', 'payment_failed'] as string[],
};

export type CommerceNotifEvent =
  | 'payment_succeeded'
  | 'payment_failed'
  | 'order_cancelled'
  | 'order_shipped'
  | 'order_delivered'
  | 'low_stock';
