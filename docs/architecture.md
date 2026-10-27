# Architecture

## Application

Expo Router owns navigation; React Native views render on all platforms. NativeWind is used for shared layout utilities. Semantic palette tokens provide the four style/brightness combinations. SVG tile geometry is drawn in code and is decorative. Next.js and DOM-only shadcn components are intentionally not dependencies of this native-first application.

`src/lib/domain.ts` holds dates, validation, recurrence preview, types and demo fixtures. `src/state/AppProvider.tsx` owns session-scoped persistence and mutations. `src/lib/backend.ts` wraps Supabase. Screens consume domain actions rather than writing database tables directly.

## Data and authorization

Households have members and task templates. Each template produces unique `(template_id, due_date)` task occurrences. `dashboard()` materializes a bounded 35-day window with `ON CONFLICT DO NOTHING`: opening the app twice cannot duplicate work or reset completed instances. Status and feedback affect one occurrence only. Task events retain an audit trail.

Every table enables RLS. Authenticated users may read only their household's members, templates and tasks. Client table writes are revoked. Security-definer RPCs set a fixed search path and check the authenticated user, household, role and assignee. Invitation creation is employer-only; acceptance locks the invitation before checking expiry and consumption. A shared household ID from a client is never trusted.

## Sync and offline behavior

A status/feedback mutation receives a UUID and expected server version. The complete outbox is durably written before an optimistic update appears. Failed local persistence rejects the action. A serialized mutation pipeline prevents read/modify/write races. Only one pending mutation per task is allowed.

The server locks the task, verifies access, recognizes already-applied mutation IDs, checks the version, and atomically writes the new state plus event. A response lost after a successful commit can therefore be retried safely. A stale version becomes a visible conflict, not a silent overwrite. Non-retryable conflicts retain the note until the user discards the local action.

Offline status changes are retried on foreground, every 15 seconds while running, and manually. Snapshot/outbox storage is scoped to account ID, with a separate demo key. Sign-out is blocked until pending changes are resolved. No background synchronization promise is made.

## Repeatable local integration checks

See [Supabase integration tests](supabase-integration.md) for the disposable Docker stack and two isolated authenticated browser sessions. It covers real JWT/RLS/RPC permissions, concurrent updates and invitations, offline persistence, lost-response retry and conflict note retention. The dedicated CI job is separate from the PGlite and Demo suites; its actual result is required before claiming that validation passed.

## Release checks still requiring external setup

Apply the migration to a fresh Supabase project and verify employer/helper accounts on two separate devices. Test email confirmation, household invitation, task propagation, airplane-mode updates and two-device conflict handling. Test Android and iOS development builds, keyboard behavior, safe areas, secure token storage and device appearance. Deploy the web export with SPA routing and verify email confirmation URLs.
