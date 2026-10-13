# CynSeat

Free ticketing for NGOs and event organizers: a single-event ticket storefront with a short path from the event page to checkout.

**[Live site](https://cynseat.vercel.app)**

## Features

- **Ticket storefront** for one event, with a live count of remaining tickets and a low-stock notice
- **Stripe Checkout** for guests and signed-in users, up to 5 tickets per purchase
- **Atomic seat allocation** — seats are reserved in a Firestore transaction, so two buyers can never get the same seat
- **PDF tickets** generated per seat with `pdf-lib` and stored in Firebase Storage
- **My tickets** page for signed-in users
- **Admin view** with a downloadable ticket list
- **English, Finnish, and Turkish** localization with a language switcher

## Tech stack

- [Next.js 14](https://nextjs.org/) (Pages Router) + TypeScript
- Tailwind CSS
- Firebase Authentication, Firestore, and Storage (client SDK + Admin SDK)
- Stripe Checkout
- i18next / react-i18next
- Deployed on Vercel

## Getting started

Requirements: Node.js 18.17+, a Firebase project, and a Stripe account.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Create `.env.local` in the project root:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase Analytics (optional) |
| `FIREBASE_PROJECT_ID` | Firebase Admin SDK (server) |
| `FIREBASE_CLIENT_EMAIL` | Firebase Admin SDK (server) |
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK (server) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe.js in the browser |
| `NEXT_PUBLIC_STRIPE_TEST_KEY` | Stripe secret key, read by the API routes only |

## Configuring the event

Event settings live in `lib/constants.ts`:

| Constant | Default | Meaning |
| --- | --- | --- |
| `TICKET_PRICE_EUR` | `5` | Price per ticket, in euros |
| `MAX_TICKETS_PER_PURCHASE` | `5` | Largest order allowed |
| `MAX_EVENT_TICKETS` | `300` | Total seats for the event |
| `LOW_REMAINING_THRESHOLD` | `20` | When to show the "few left" notice |
| `EVENT_POSTER_SRC` | `/masal.jpeg` | Poster image in `public/` |

Admin accounts are listed in `lib/admin.ts`. Event copy is in `locales/{en,fi,tr}/common.json`.

## Project structure

```
pages/            routes: storefront, sign in/up, tickets, admin, success/cancel
pages/api/        create-checkout-session, retrieve-checkout-session, handlePurchase
components/       header, footer, checkout button, ticket card, language switcher
contexts/         auth context
firebase/         client and Admin SDK setup
lib/              constants, admin check, auth error mapping, return-URL helper
locales/          en, fi, tr translations
assets/           PDF ticket template
scripts/          database cleanup and Firestore test scripts (see scripts/README_CLEANUP.md)
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |

## License

[MIT](LICENSE)
