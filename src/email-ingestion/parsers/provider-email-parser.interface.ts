import { ExtractedBooking } from '../entities/ingested-email.entity';

export interface RawEmail {
  fromAddress: string;
  subject: string;
  text: string;
  html: string;
}

export interface ProviderEmailParser {
  /** Returns true when this parser handles the given email. */
  detect(email: RawEmail): boolean;

  /** Extracts structured booking data from the email. Throws on failure. */
  parse(email: RawEmail): ExtractedBooking;
}
