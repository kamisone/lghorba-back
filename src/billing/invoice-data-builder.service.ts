import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../bookings/booking.entity';
import { TaxRate } from './tax-rate.entity';
import { DocumentInput } from '../documents/document.service';

/**
 * Computes the document payload for a rental booking.
 * All rental-specific domain knowledge lives here — DocumentService stays generic.
 */
@Injectable()
export class InvoiceDataBuilderService {
  constructor(
    @InjectRepository(Booking)  private readonly bookingRepo:  Repository<Booking>,
    @InjectRepository(TaxRate)  private readonly taxRateRepo:  Repository<TaxRate>,
  ) {}

  async buildFromBooking(bookingId: string, paymentIntentId: string | null): Promise<DocumentInput> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['car', 'user'],
    });
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);

    const taxRate  = await this.getActiveTaxRate('FR', 'car_rental');
    const rate     = Number(taxRate.rate);

    const totalTtc    = Math.round(Number(booking.totalPrice) * 100);           // cents
    const subtotalHt  = Math.round((totalTtc / (1 + rate)));
    const taxCents    = totalTtc - subtotalHt;

    const car      = booking.car;
    const carLabel = [car?.brand, car?.model, car?.modelYear].filter(Boolean).join(' ') || car?.name || 'Vehicle';

    const startDate = booking.startDateTime.toISOString().slice(0, 10);
    const endDate   = booking.endDateTime.toISOString().slice(0, 10);
    const days      = Math.max(1, Math.ceil(
      (booking.endDateTime.getTime() - booking.startDateTime.getTime()) / 86_400_000,
    ));

    const deliveryCents = booking.deliveryRequested && booking.deliveryFee != null
      ? Math.round(Number(booking.deliveryFee) * 100)
      : 0;
    const rentalCents   = totalTtc - deliveryCents;
    const discountCents = booking.discountAmount != null
      ? Math.round(Number(booking.discountAmount) * 100)
      : 0;

    const lines: DocumentInput['lines'] = [
      {
        description:    `Location ${carLabel} – du ${startDate} au ${endDate}`,
        quantity:       days,
        unitPriceCents: Math.round(rentalCents / days),
        totalCents:     rentalCents,
        periodStart:    startDate,
        periodEnd:      endDate,
        sortOrder:      0,
      },
    ];

    if (deliveryCents > 0) {
      lines.push({
        description:    booking.deliveryAddress ? `Livraison – ${booking.deliveryAddress}` : 'Livraison',
        quantity:       1,
        unitPriceCents: deliveryCents,
        totalCents:     deliveryCents,
        periodStart:    startDate,
        periodEnd:      endDate,
        sortOrder:      1,
      });
    }

    if (discountCents > 0) {
      lines.push({
        description:    booking.promoCode ? `Réduction (${booking.promoCode})` : 'Réduction promotionnelle',
        quantity:       1,
        unitPriceCents: -discountCents,
        totalCents:     -discountCents,
        sortOrder:      2,
      });
    }

    return {
      entityType:      'booking',
      entityId:        bookingId,
      documentType:    'invoice',
      paymentIntentId: paymentIntentId,
      customer: {
        email:  booking.user?.email ?? '',
        name:   booking.user?.name  ?? null,
        locale: 'fr',
      },
      seller: {
        name:       process.env.SELLER_NAME            ?? '',
        address: {
          line1:   process.env.SELLER_ADDRESS_LINE1    ?? '',
          city:    process.env.SELLER_ADDRESS_CITY     ?? '',
          zip:     process.env.SELLER_ADDRESS_ZIP      ?? '',
          country: process.env.SELLER_ADDRESS_COUNTRY  ?? 'FR',
        },
        vatNumber:  process.env.SELLER_VAT_NUMBER      ?? null,
        siret:      process.env.SELLER_SIRET            ?? null,
      },
      financial: {
        subtotalCents:  subtotalHt,
        deliveryCents,
        discountCents,
        taxCents,
        totalCents:     totalTtc,
        couponCode:     booking.promoCode ?? null,
      },
      tax: {
        ratePct:  Math.round(rate * 100),
        label:    taxRate.label,
        country:  'FR',
      },
      deliveryAddress: booking.deliveryAddress
        ? { line1: booking.deliveryAddress }
        : null,
      contextSnapshot: { carLabel, startDate, endDate },
      lines,
    };
  }

  private async getActiveTaxRate(countryCode: string, serviceType: string): Promise<TaxRate> {
    const today = new Date().toISOString().slice(0, 10);
    const rate  = await this.taxRateRepo
      .createQueryBuilder('t')
      .where('t.countryCode = :c', { c: countryCode })
      .andWhere('t.serviceType = :s', { s: serviceType })
      .andWhere('t.validFrom <= :d', { d: today })
      .andWhere('(t.validTo IS NULL OR t.validTo >= :d)', { d: today })
      .orderBy('t.validFrom', 'DESC')
      .getOne();
    if (!rate) throw new Error(`No active tax rate for ${countryCode}/${serviceType}`);
    return rate;
  }
}
