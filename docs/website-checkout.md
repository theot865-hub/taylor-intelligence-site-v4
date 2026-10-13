# Website offer checkout

Homepage review prepared October 12, 2026. All prices CAD.

- Website design & development: $1,500 one-time.
- Maintenance & SEO: $500/month, beginning when the website launches (Theo's explicit timing decision).
- Homepage checkout: https://buy.stripe.com/aFa14pa10ffO1LLgcdeIw01
- The link collects only $1,500. Its description and confirmation explain that monthly billing starts separately at launch.

## Stripe records

Taylor Intelligence merchant `acct_1UNexwPUw9hCFj9H`, live mode:

| Item | Record |
| --- | --- |
| Website product | `prod_VQjUjqvvqdcY67` |
| CAD 1,500 one-time price | `price_1UPs1bPUw9hCFj9HC0wc1uKq` |
| Upfront payment link | `plink_1UPs2cPUw9hCFj9H57OmwpL3` |
| Maintenance & SEO product | `prod_VQjYEmg9fUs7Ob` |
| CAD 500/month price | `price_1UPs54PUw9hCFj9HF7IkXyEr` |

The payment link collects name and business name. Automatic tax and automatic payment-method saving remain off. No customer was charged during implementation.

## At launch

There is no launch event integration or automatic subscription enrollment. When the customer's website actually launches, activate monthly billing using the maintenance price above through the normal customer billing process. Obtain the customer's recurring payment authorization then; the upfront payment does not save a card for this purpose. Do not start the subscription on initial purchase or assume a launch date.

## Education and marketing

The homepage reuses `/ai-intensive/checkout.js` and the existing server-side `/api/checkout` flow. CAD 1,200/company seat includes its owner; CAD 100 per employee observer. Dates remain TBA. Existing success/cancel pages remain under `/ai-intensive/`.

Marketing is quoted by scope, with ad spend explained separately from service fees. Fit-call buttons use the existing Google Calendar appointment schedule, verified as “30 min with Theo.”

The local 4191 review server forwards only the three existing education checkout API routes to the owned production API. This development proxy is outside the repository. The deployed Worker remains unchanged.

## Verification

Public website checkout displayed Taylor Intelligence, CAD 1,500 and launch-billing terms. Homepage education selection with two employees opened the existing Stripe checkout at CAD 1,400. No card entry or payment submitted. Seven viewport widths passed; seat limits/totals and checkout-error retry passed; existing 24 checkout tests passed.
