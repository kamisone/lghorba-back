/**
 * Seed data for shop_countries.
 * ISO 3166-1 — focused on the platform's primary markets.
 * Extend as needed; adding a row never breaks existing data.
 */
export const COUNTRY_SEED: Array<{
  isoCode: string;
  name: string;
  nativeName: string;
  phonePrefix: string;
  currencyCode: string;
  isoCode3: string;
  continentCode: string;
  isEuVat: boolean;
  isShippingEnabled: boolean;
}> = [
  { isoCode: 'FR', name: 'France',          nativeName: 'France',        phonePrefix: '+33',  currencyCode: 'EUR', isoCode3: 'FRA', continentCode: 'EU', isEuVat: true,  isShippingEnabled: true  },
  { isoCode: 'MA', name: 'Morocco',          nativeName: 'المغرب',        phonePrefix: '+212', currencyCode: 'MAD', isoCode3: 'MAR', continentCode: 'AF', isEuVat: false, isShippingEnabled: true  },
  { isoCode: 'BE', name: 'Belgium',          nativeName: 'België',        phonePrefix: '+32',  currencyCode: 'EUR', isoCode3: 'BEL', continentCode: 'EU', isEuVat: true,  isShippingEnabled: true  },
  { isoCode: 'CH', name: 'Switzerland',      nativeName: 'Schweiz',       phonePrefix: '+41',  currencyCode: 'CHF', isoCode3: 'CHE', continentCode: 'EU', isEuVat: false, isShippingEnabled: true  },
  { isoCode: 'DE', name: 'Germany',          nativeName: 'Deutschland',   phonePrefix: '+49',  currencyCode: 'EUR', isoCode3: 'DEU', continentCode: 'EU', isEuVat: true,  isShippingEnabled: true  },
  { isoCode: 'ES', name: 'Spain',            nativeName: 'España',        phonePrefix: '+34',  currencyCode: 'EUR', isoCode3: 'ESP', continentCode: 'EU', isEuVat: true,  isShippingEnabled: true  },
  { isoCode: 'GB', name: 'United Kingdom',   nativeName: 'United Kingdom', phonePrefix: '+44', currencyCode: 'GBP', isoCode3: 'GBR', continentCode: 'EU', isEuVat: false, isShippingEnabled: true  },
  { isoCode: 'IT', name: 'Italy',            nativeName: 'Italia',        phonePrefix: '+39',  currencyCode: 'EUR', isoCode3: 'ITA', continentCode: 'EU', isEuVat: true,  isShippingEnabled: true  },
  { isoCode: 'NL', name: 'Netherlands',      nativeName: 'Nederland',     phonePrefix: '+31',  currencyCode: 'EUR', isoCode3: 'NLD', continentCode: 'EU', isEuVat: true,  isShippingEnabled: true  },
  { isoCode: 'PT', name: 'Portugal',         nativeName: 'Portugal',      phonePrefix: '+351', currencyCode: 'EUR', isoCode3: 'PRT', continentCode: 'EU', isEuVat: true,  isShippingEnabled: true  },
  { isoCode: 'LU', name: 'Luxembourg',       nativeName: 'Luxembourg',    phonePrefix: '+352', currencyCode: 'EUR', isoCode3: 'LUX', continentCode: 'EU', isEuVat: true,  isShippingEnabled: true  },
  { isoCode: 'DZ', name: 'Algeria',          nativeName: 'الجزائر',       phonePrefix: '+213', currencyCode: 'DZD', isoCode3: 'DZA', continentCode: 'AF', isEuVat: false, isShippingEnabled: false },
  { isoCode: 'TN', name: 'Tunisia',          nativeName: 'تونس',          phonePrefix: '+216', currencyCode: 'TND', isoCode3: 'TUN', continentCode: 'AF', isEuVat: false, isShippingEnabled: false },
  { isoCode: 'US', name: 'United States',    nativeName: 'United States', phonePrefix: '+1',   currencyCode: 'USD', isoCode3: 'USA', continentCode: 'NA', isEuVat: false, isShippingEnabled: false },
  { isoCode: 'CA', name: 'Canada',           nativeName: 'Canada',        phonePrefix: '+1',   currencyCode: 'CAD', isoCode3: 'CAN', continentCode: 'NA', isEuVat: false, isShippingEnabled: false },
];
