# Data and platform compliance guardrails

This document describes product safeguards, not legal advice. Deployers remain responsible for their jurisdiction, industry, sources, and platform agreements.

## LinkedIn

LocalGrowth OS does not scrape LinkedIn pages or automate engagement through browser sessions. LinkedIn's User Agreement prohibits software and crawlers that scrape profiles/data and unauthorized bots that create or interact with posts. The product supports:

- Official posting APIs when the user's app/account has the required access.
- Approved partner/data-provider adapters under the deployer's own agreement.
- User-owned CSV/CRM imports and manual records.
- LinkedIn Lead Gen Forms or other documented APIs when access is granted.

References:

- https://www.linkedin.com/legal/user-agreement
- https://www.linkedin.com/legal/crawling-terms
- https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api

## Google Maps and Places

Business discovery should use the Places API or another licensed provider, not HTML scraping of Google Maps. The adapter must surface attribution, restrict caching/storage to what the applicable terms permit, and store source/evidence metadata. A durable `place_id` may be retained where policy permits; other fields receive source-specific expiry rules.

Reference: https://developers.google.com/maps/documentation/places/web-service/policies

## Public websites

- Respect robots directives and site terms.
- Identify the crawler and provide an operator contact URL.
- Enforce per-host concurrency, delay, timeout, response-size, and allowed-content-type limits.
- Do not log in, bypass paywalls/CAPTCHAs, evade blocks, or probe private networks.
- Collect only fields needed for the configured business purpose and retain evidence/source URLs.
- Provide suppression, correction, export, and deletion mechanisms.

## Outreach

- The core creates drafts; bulk send is not enabled by default.
- Require a configured legal basis/consent state, sender identity, suppression check, and jurisdiction policy before sending.
- Enforce unsubscribe/opt-out immediately and across all connectors.
- Prohibit purchased-list spam, deceptive identity, fake personalization, and sensitive-trait targeting.

## AI-generated content

- Display provenance and require review for factual claims, testimonials, prices, guarantees, and regulated topics.
- Freeze the approved version; any subsequent edit requires fresh approval.
- Run duplicate, PII, prohibited-claim, and platform-limit checks before approval and again before publish.
- Keep a per-workspace emergency stop and a complete audit trail.
