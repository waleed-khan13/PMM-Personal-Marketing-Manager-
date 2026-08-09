# Data and platform compliance guardrails

This document describes product safeguards, not legal advice. Deployers remain responsible for their jurisdiction, industry, sources, and platform agreements.

## LinkedIn

LocalGrowth OS does not scrape LinkedIn pages or automate engagement through browser sessions. LinkedIn's User Agreement prohibits software and crawlers that scrape profiles/data and unauthorized bots that create or interact with posts. The product supports:

- Official posting APIs when the user's app/account has the required access.
- Approved partner/data-provider adapters under the deployer's own agreement.
- User-owned CSV/CRM imports and manual records.
- LinkedIn Lead Gen Forms or other documented APIs when access is granted.

The lead vault implements the user-owned export path. Each imported record keeps source evidence, deduplicates locally, and remains subject to the global suppression list; it does not fetch or automate LinkedIn pages. The LinkedIn Member publisher is a separate outbound-only integration: it accepts an operator-supplied OAuth token, verifies the consenting member through OpenID Connect userinfo, and sends only exact approved text revisions through the official Posts API.

References:

- https://www.linkedin.com/legal/user-agreement
- https://www.linkedin.com/legal/crawling-terms
- https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api

## Google Maps and Places

Version 0.6 uses Places API (New) Text Search and never requests Google Maps HTML. It displays Google Maps and any returned provider attribution in the result container. Results are returned with `Cache-Control: no-store`, held only in active browser state, and not persisted to SQLite; the connector API key is encrypted locally. When an operator selects a result's website, the separate crawler collects only fields independently published by that website. The product terms and privacy notice link to the applicable Google terms and privacy policy.

References:

- https://developers.google.com/maps/documentation/places/web-service/text-search
- https://developers.google.com/maps/documentation/places/web-service/policies
- https://developers.google.com/maps/documentation/places/web-service/place-id

## Public websites

- Respect robots directives and site terms.
- Identify the crawler with the LocalGrowth project URL; a configurable operator contact URL remains roadmap work.
- Enforce per-host concurrency, delay, timeout, response-size, and allowed-content-type limits.
- Do not log in, bypass paywalls/CAPTCHAs, evade blocks, or probe private networks.
- Collect only fields needed for the configured business purpose and retain evidence/source URLs.
- Provide suppression, correction, export, and deletion mechanisms.

Version 0.8 implements identified sequential crawling, public-address validation, same-domain redirect enforcement, robots rules and crawl delay, strict time/size/content limits, contact-page selection, source URLs, suppression, per-lead JSON export, and explicit lead deletion. A configurable operator contact URL remains roadmap work.

Version 0.9 applies the same public-address, redirect, robots, type, timeout, and size controls to the Local SEO lab. A manual or scheduled audit stores derived checks, metrics, scores, and recommendations but discards fetched HTML. Recommendations are deterministic observations, not guarantees of ranking or a substitute for Lighthouse, Search Console, or professional review; integrations that are not installed are labeled as planned.

## Lead qualification

- Use business-fit signals such as published service keywords, target geography, website availability, and direct business contact fields.
- Do not score protected or sensitive personal traits, inferred vulnerability, health status, political views, religion, or similarly sensitive attributes.
- Show every deterministic reason code and point change rather than presenting an unexplained AI prediction.
- Keep human corrections separate from the computed score, require a written reason, and audit both correction and reset actions.
- Treat the score as workflow prioritization, not proof of consent or a legal basis for outreach.

Version 0.8 keeps local deterministic ICP profiles, full-vault rescoring, explanation history for the current profile version, high-intent filtering, and auditable manual correction. A score never establishes outreach eligibility.

## Outreach

- The core creates drafts; bulk send is not enabled by default.
- Require a configured legal basis/consent state, sender identity, suppression check, and jurisdiction policy before sending.
- Enforce unsubscribe/opt-out immediately and across all connectors.
- Prohibit purchased-list spam, deceptive identity, fake personalization, and sensitive-trait targeting.

Version 0.8 requires an operator-recorded legal basis, compatible consent state, supporting purpose/evidence note, current retention review date, deliverable email, and suppression check before generation. AI output is an editable plain-text email draft. Edits increment the revision and invalidate approval; only the exact approved revision can be exported as CSV. The core has no outreach send endpoint. Retention expiry blocks generation/export and surfaces a review filter, but never silently deletes data. Permanent deletion requires a written reason and the exact typed confirmation `DELETE`; a non-personal audit event remains.

## AI-generated content

- Display provenance and require review for factual claims, testimonials, prices, guarantees, and regulated topics.
- Freeze the approved version; any subsequent edit requires fresh approval.
- Run duplicate, PII, prohibited-claim, and platform-limit checks before approval and again before publish.
- Keep a per-workspace emergency stop and a complete audit trail.
