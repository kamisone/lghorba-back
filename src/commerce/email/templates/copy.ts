export type Lang = 'fr' | 'en';

export function resolveLang(locale?: string | null): Lang {
  return locale === 'en' ? 'en' : 'fr';
}

export const COPY = {
  fr: {
    footer:   (year: number, name: string) => `© ${year} ${name}. Tous droits réservés.`,

    orderConfirmed: {
      subject:    (n: string) => `Commande confirmée – ${n}`,
      greeting:   (name: string) => `Bonjour ${name},`,
      intro:      "Merci pour votre commande ! Nous l'avons bien reçue et allons commencer à la traiter sous peu.",
      colProduct:  'Produit',
      colQty:      'Qté',
      colPrice:    'Prix unitaire',
      colTotal:    'Total',
      subtotal:    'Sous-total',
      shipping:    'Livraison',
      discount:    'Réduction',
      promoCode:   'Code promo',
      freeShipping:'Gratuite',
      grandTotal:  'Total',
      orderRef:    'Référence commande',
      trackOrder:  'Suivre ma commande',
      helpText:    "Si vous avez la moindre question, n'hésitez pas à contacter notre service client.",
    },

    orderShipped: {
      subject:    (n: string) => `Votre commande ${n} est en route !`,
      greeting:   (name: string) => `Bonjour ${name},`,
      intro:      (n: string) => `Excellente nouvelle ! Votre commande <strong>${n}</strong> est en chemin.`,
      tracking:   (t: string, c?: string | null) =>
        `Votre numéro de suivi est <strong>${t}</strong>${c ? ` (${c})` : ''}.`,
      eta:        'Vous devriez la recevoir dans les délais estimés.',
      trackOrder: 'Suivre ma livraison',
    },

    reviewRequest: {
      subject:    (p: string) => `Comment était votre ${p} ?`,
      greeting:   (name: string) => `Bonjour ${name},`,
      intro:      (product: string, order: string) =>
        `Nous espérons que vous profitez de votre <strong>${product}</strong> (commande <strong>${order}</strong>).`,
      body:       "Votre avis aide d'autres clients — cela ne prend qu'une minute.",
      cta:        'Laisser un avis',
      fallback:   'Si le bouton ne fonctionne pas, copiez-collez ce lien :',
    },

    paymentFailed: {
      subject:    (n: string) => `Paiement non abouti – ${n}`,
      greeting:   (name: string) => `Bonjour ${name},`,
      intro:      (n: string) =>
        `Malheureusement, nous n'avons pas pu traiter votre paiement pour la commande <strong>${n}</strong>.`,
      body:       'Vos articles sont réservés encore un moment. Veuillez réessayer avec un autre mode de paiement :',
      cta:        'Réessayer le paiement',
      note:       "Si vous continuez à rencontrer des problèmes, veuillez contacter notre service client.",
    },

    stockAlert: {
      subject:    (p: string) => `${p} est de nouveau en stock !`,
      intro:      'Bonne nouvelle ! Un article de votre liste de souhaits est de nouveau disponible :',
      cta:        'Voir le produit',
      urgency:    'Dépêchez-vous — les stocks sont limités.',
    },

    abandonedCart: {
      subject:    'Vous avez oublié quelque chose !',
      greeting:   (name: string) => `Bonjour ${name},`,
      intro:      "Vous avez laissé des articles dans votre panier. Ne les laissez pas partir !",
      cta:        'Finaliser ma commande',
      note:       'Votre panier est sauvegardé — cliquez simplement pour reprendre là où vous en étiez.',
    },
  },

  en: {
    footer:   (year: number, name: string) => `© ${year} ${name}. All rights reserved.`,

    orderConfirmed: {
      subject:    (n: string) => `Order confirmed – ${n}`,
      greeting:   (name: string) => `Hello ${name},`,
      intro:      "Thank you for your order! We've received it and will start processing it shortly.",
      colProduct:  'Product',
      colQty:      'Qty',
      colPrice:    'Unit price',
      colTotal:    'Total',
      subtotal:    'Subtotal',
      shipping:    'Shipping',
      discount:    'Discount',
      promoCode:   'Promo code',
      freeShipping:'Free',
      grandTotal:  'Total',
      orderRef:    'Order reference',
      trackOrder:  'Track my order',
      helpText:    'If you have any questions, feel free to reach out to our support team.',
    },

    orderShipped: {
      subject:    (n: string) => `Your order ${n} has shipped!`,
      greeting:   (name: string) => `Hello ${name},`,
      intro:      (n: string) => `Great news! Your order <strong>${n}</strong> is on its way.`,
      tracking:   (t: string, c?: string | null) =>
        `Your tracking number is <strong>${t}</strong>${c ? ` (${c})` : ''}.`,
      eta:        'You should receive it within the estimated delivery window.',
      trackOrder: 'Track my delivery',
    },

    reviewRequest: {
      subject:    (p: string) => `How was your ${p}?`,
      greeting:   (name: string) => `Hello ${name},`,
      intro:      (product: string, order: string) =>
        `We hope you're enjoying your <strong>${product}</strong> from order <strong>${order}</strong>.`,
      body:       "We'd love to hear what you think — it only takes a minute and helps other customers.",
      cta:        'Leave a review',
      fallback:   "If the button doesn't work, copy and paste this link:",
    },

    paymentFailed: {
      subject:    (n: string) => `Payment unsuccessful – ${n}`,
      greeting:   (name: string) => `Hello ${name},`,
      intro:      (n: string) =>
        `Unfortunately, we were unable to process your payment for order <strong>${n}</strong>.`,
      body:       'Your items are still reserved for a short period. Please try again with a different payment method:',
      cta:        'Retry payment',
      note:       'If you continue to experience issues, please contact our support team.',
    },

    stockAlert: {
      subject:    (p: string) => `${p} is back in stock!`,
      intro:      'Good news! An item from your wishlist is back in stock:',
      cta:        'View product',
      urgency:    'Hurry — stock is limited.',
    },

    abandonedCart: {
      subject:    'You left something behind!',
      greeting:   (name: string) => `Hello ${name},`,
      intro:      "You left some items in your cart. Don't let them get away!",
      cta:        'Complete my order',
      note:       'Your cart is saved — just click the button to continue where you left off.',
    },
  },
} as const;
