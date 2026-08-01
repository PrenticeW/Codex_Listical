# Listical — Record of Processing Activities (UK GDPR Article 30) (Internal)

Controller: Studio PDW Ltd, company number 16687130, Flat 73 Boyd Building, 3 Hudson Way, London, England, E16 2GW
Contact: hello@tacular.app
Data Protection Officer: not required (small controller, no large scale special category processing); responsible person is Prentice Whitlow.
Last reviewed: 1 August 2026

---

## Processing activity 1 — Providing the Listical service

- **Purpose:** operating a personal 12 week cycle planning tool (web and iOS).
- **Categories of data subjects:** registered users (adults, 18+).
- **Categories of personal data:** email address, hashed password, date of birth (age verification only), user generated planning content (goals, plans, tasks, notes, schedules), account preferences (colour theme).
- **Special category data:** none collected by design. Users could in principle type sensitive information into free text notes; treated as user content, protected by RLS and encryption.
- **Lawful basis:** contract (Art. 6(1)(b)) for account and planning data; legitimate interests (Art. 6(1)(f)) for the 18+ age check.
- **Recipients / processors:** Supabase (database, auth; hosted Paris, France (in the European Union)), Vercel (web hosting), Brevo (transactional email), Apple (iOS app distribution only, no planning data).
- **International transfers:** where processors operate outside UK/EEA, covered by SCCs with the UK Addendum or adequacy decisions. See processor DPAs on file.
- **Retention:** life of account; full deletion on account deletion; backups roll over within 7 days. See retention schedule.
- **Security measures:** TLS in transit, encryption at rest, row level security on every table scoping data to `user_id`, hashed passwords, restricted production access, no third party analytics or trackers.

## Processing activity 2 — Account deletion and compliance records

- **Purpose:** honouring erasure requests and demonstrating compliance.
- **Data:** user id, request and completion timestamps, status (in `deletion_audit_log`). No planning content.
- **Lawful basis:** legal obligation (Art. 6(1)(c)) and legitimate interests (Art. 6(1)(f)).
- **Retention:** 12 months after deletion completes.

## Processing activity 3 — Transactional email

- **Purpose:** signup confirmation, password reset, essential service notices.
- **Data:** email address, email delivery metadata.
- **Lawful basis:** contract (Art. 6(1)(b)).
- **Processor:** Brevo. Retention per Brevo settings (minimised).

## Processing activity 4 — Support correspondence

- **Purpose:** responding to user questions and rights requests.
- **Data:** email address, correspondence content.
- **Lawful basis:** contract / legitimate interests.
- **Retention:** 24 months.

---

## Not processed

No analytics or behavioural tracking, no advertising, no sale of data, no automated decision making or profiling, no children's data (18+ enforced at database level), no special category data collected by design.

## Review triggers

Update this record when: a new processor is added, a new category of data is collected, monetisation launches, analytics are ever introduced, or hosting regions change.
