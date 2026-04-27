import { z } from 'zod';

export const CreateContactSchema = z.object({
  name:    z.string().min(1, 'Name is required'),
  contact: z.string().min(1, 'Contact is required'),
  subject: z.string().min(1, 'Subject is required'),
  message: z.string().min(1, 'Message is required'),
});

export type CreateContactDto = z.infer<typeof CreateContactSchema>;
