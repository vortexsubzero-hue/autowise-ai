# AutoWise paid-beta launch checklist

## Ready in this release

- [x] VIN decoder and vehicle dashboard
- [x] NHTSA recall research
- [x] Secure server-side OpenAI key
- [x] Five-request-per-minute server rate limit
- [x] Optional beta access-code gate
- [x] Clear API-credit and service errors
- [x] Copy, print, and local analysis history
- [x] Security headers and privacy-conscious AI request settings
- [x] Privacy and Terms drafts
- [x] Automated backend tests
- [x] Checkout disabled until a verified link is configured

## Required before the first paid customer

- [ ] Add OpenAI API billing and set a conservative monthly usage limit
- [ ] Perform one successful AI analysis on the live site
- [ ] Choose the seller or business name customers will see
- [ ] Publish a support email address
- [ ] Decide and publish the exact pack size, expiration, and refund terms
- [ ] Obtain appropriate legal review for Privacy and Terms
- [ ] Create the one-time checkout product and ensure its price matches the site
- [ ] Create unique beta codes and store them only in Netlify
- [ ] Add the verified checkout URL to `config.js`
- [ ] Complete a real low-value purchase, delivery, AI-use, and refund test
- [ ] Keep checkout private until that end-to-end test passes

## Safe founding-beta workflow (small number of customers)

1. Customer uses the hosted payment checkout.
2. Operator confirms the payment in the payment provider dashboard.
3. Operator privately sends that customer one unique beta code.
4. Customer enters the code in AutoWise before using AI Mechanic.
5. Operator removes compromised or refunded codes from `BETA_ACCESS_CODES` and redeploys.

This manual workflow is suitable only for a small, invite-only test. It does not enforce a three-analysis purchase by itself.

## Required before public scale

- [ ] Customer authentication
- [ ] Database-backed entitlements and credit balances
- [ ] Signed checkout webhooks with replay protection
- [ ] Automatic access delivery
- [ ] Server-side per-customer usage accounting
- [ ] Refund and chargeback handling
- [ ] Support and incident-response process
- [ ] Consent-aware product analytics and error monitoring
- [ ] Custom domain, branded email, and production operator contact details
- [ ] Accessibility, security, and legal review

## First metrics to track manually

- Landing page visitors
- VIN decode successes and failures
- Recall searches
- AI analyses attempted, completed, and failed
- OpenAI cost per completed analysis
- Checkout visits, purchases, refunds, and support requests
- Repeat use and customer-reported usefulness
