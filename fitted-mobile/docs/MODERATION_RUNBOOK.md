# emode moderation runbook

emode has zero tolerance for objectionable content and abusive users. Reports are stored in `public.reports`; clients can submit reports but cannot read the queue or alter status. Moderators must use a service-role-only internal tool or SQL workflow.

## Review targets

- Urgent safety reports (credible threats, child safety, non-consensual sexual content): begin review as soon as alerted, preserve necessary evidence, restrict the content/account, and escalate to the appropriate provider or authority where legally required.
- Other reports: target initial review within 24 hours.
- Appeals and support follow-ups: target a response within two business days.

## Review workflow

1. Open pending reports ordered by `created_at`; never expose reporter identity to the reported user.
2. Review the referenced post, comment, message, AI generation, product, or account in context.
3. Choose an action: no action, content removal, listing deactivation, warning, temporary restriction, or account termination.
4. Record the action and rationale in `moderation_actions`, then mark the report `resolved` or `rejected`.
5. For removed public media, delete the related storage objects. For account termination, use the account deletion/suspension procedure rather than editing entitlement or payment fields from a client.
6. Check for linked duplicate reports and repeated violations.

## Controls to verify before each release

- Report controls exist on posts, profiles, comments, messages, product listings, and AI output.
- Blocking is reciprocal and enforced by database policies for feeds, follows, likes, comments, conversations, messages, and listings.
- Text filtering triggers remain enabled and the service-only `moderation_terms` list is current.
- The public Terms link describes prohibited content and enforcement.
- A monitored on-call destination receives urgent report alerts. Database intake alone is not sufficient for launch operations.
