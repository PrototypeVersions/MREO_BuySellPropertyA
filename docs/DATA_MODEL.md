# Property workspaces and saved data

The four tabs describe four views of a property case. They do not each create a separate copy of its records.

| View | Owns | References |
| --- | --- | --- |
| Auction | Participation, bids, deadline, result | Property and transaction |
| Messages | Participant conversations | Documents, signing events, service requests |
| Coordination | Service requests and work status | Property, transaction, report documents |
| Files | A searchable-by-eye document index | The same documents shown in Messages |

## My properties

`my-properties.html` is the property index linked from the main menu. It reads the signed-in account's existing `/api/v1/transactions` response and the current site's saved guided demonstrations. It does not create a new transaction, track passive browsing, or change any saved run while listing it.

Account entries are grouped by their property ID when available, otherwise by transaction kind and normalized property title. Duplicate participant roles for the same transaction become one workspace link. Guided runs use their normalized property title to group repeated perspectives for the same sample address. Account and demonstration groups always remain separate. Each group opens the most recently updated workspace; other saved runs or transactions remain accessible in its expandable list. A demonstration reopens its saved tab and original run ID.

Account records stay in memory and are cleared on sign-out or account changes. Only the existing guided-run snapshots remain in browser storage. This index does not add permissions or expose new backend endpoints. **Find a property**, **Start a demonstration**, and the secondary portfolio and service partner links keep the removed menu destinations reachable.

## Guided public demonstration

`experience.html` opens `demo-case.html`. No account is required. The new demonstration imports only `demo-store.js` and does not call the connected account, payment, signing, or coordination APIs.

Each run has an independent ID and a fixed participant perspective. Choosing another perspective or selecting **New demonstration** creates a new run. It does not delete previous runs or reset a connected account. **Resume demonstration** opens the most recently saved run. A run's URL can reopen it in the same browser; it does not transfer its data to another device.

The browser stores a JSON snapshot under `mreo:guided-demo:v1:<site-directory>run:<run-id>` and an active-run pointer under the same prefix. The snapshot contains:

| Record | Relationship |
| --- | --- |
| Property | The fictional property's ID, title, reference price |
| Auction and bids | Auction belongs to the property; each bid belongs to the auction |
| Transaction | Connects the property and auction to the rest of the story |
| Threads and messages | Threads belong to the transaction; each message belongs to one participant thread |
| Documents | One ID per sample PDF, with version, status and sharing roles |
| Signature requests | Reference the original document ID and its participant thread |
| Service requests | Reference the transaction, property and any delivered report document |
| Events | Timestamped actions referencing the affected record and participant thread |

A document card in Messages and a card in Files point to the same document. A signing action updates that document and appends a thread event. Completing a service references its report's document ID. None of these actions submits or changes an auction bid.

The demo uses fictional PDFs generated on demand; no uploaded file bytes are saved. Replies and provider actions are scripted examples. Sample signing requires a typed name and an explicit demonstration confirmation, saved with the signature's timestamp and document ID. Older button-only simulations can add a sample signature without losing their run. Signing here has no legal effect and sends no email. Browser storage is not an authenticated vault: anyone using that browser profile can inspect the synthetic records, including other demo roles. Use fictional sample names. Clearing site data removes this progress. When storage is unavailable, the page explicitly reports that progress is temporary.

## Connected accounts

The connected workspace uses the existing backend and data schema. This frontend redesign does not migrate or delete existing records.

- Clerk handles account identity. Server authorization selects the transaction role.
- The existing Exchange Durable Object stores shared auction and participation records.
- Cloudflare D1 stores users, roles, transaction participants, threads, messages, tasks, document metadata, signature recipients, service requests and audit events.
- The private R2 bucket stores uploaded originals and completed PDFs. Worker routes authorize document downloads.
- SignWell handles signing requests and completed-document notifications in the configured test mode. Stripe participation remains deferred while live payments are disabled.

Connected uploads now default to the selected participant conversation. Authorized MREO staff may choose another sharing scope explicitly. Files lists all documents the server permits that viewer to access; Messages displays the permitted documents belonging to the selected conversation, plus documents shared with all participants. Existing document sharing settings are retained.

Access follows the current server model: transaction buyers see the buyer thread, sellers see the seller thread, and providers see the provider thread. Authorized agent/admin accounts have broader staff access. Provider access is currently at the transaction-role level, not isolated per provider company. Cloudflare/account administrators and the services processing the records also have their respective operational access. This is not end-to-end encrypted messaging.

The backend filters activity for documents, tasks, and messages by the viewer's access. Audit metadata, including legacy signer emails, is omitted from activity responses; email addresses in generated activity summaries are redacted. Provider errors are replaced with safe application messages, with an additional email guard at the API and client error boundary. Non-staff uploads are scoped to their own participant conversation. Per-provider assignment restrictions and retention/deletion policies still need a separate production hardening pass.

## Connected signing

**Review & Sign** opens SignWell's supported embedded signing UI. It does not rely on an asynchronously opened browser popup. A signing request adds a required signature page and binds each signer to an active transaction participant's user ID. Signers who also hold staff roles retain access to their own request; staff status alone never grants another person's signing URL. The document list includes permission flags and the viewer's own signing status, without provider IDs or recipient email lists.

The signing window's completion event asks the backend to verify the provider's current record. A document is marked complete only when SignWell confirms completion and a PDF is stored in private R2 storage. The signature task cannot be manually marked complete. **Check signing status** handles delayed callbacks or a return after closing the window. Webhooks also reconcile against the provider and notify the transaction room. Request creation and status checks never expose raw provider errors.

SignWell remains in test mode. Test signatures are not legally binding. Embedded request notifications and automatic reminders are disabled; signers use their own MREO workspace. Account and recipient emails remain in the private database and with the signing provider. A signature provider's signing record or audit page may contain sender and signer identity details; a completed PDF is accessible only under that document's sharing permissions. These protections do not remove identity information from an authorized signed record.

`update-cloudflare.yml` updates backend code after changes merge to main, preserving existing secrets and webhook registration. It checks the live configuration and creates/removes one fictional SignWell test document to verify provider creation and recipient-session availability. It sends no notifications, collects no signature, and logs no email address or signing URL.

## Existing illustrative provider pages

The older service walkthroughs remain available from **Service partner demonstration** on My properties and from **Explore service pathways**. They use their existing browser state, separate from guided-run snapshots. They do not synchronize with a new guided run. Links from a connected workspace to these examples are explicitly labeled as illustrative and do not dispatch providers or change the connected transaction.

## Verification

`npm test` checks run isolation, independent status transitions, document/thread references and the existing server/auction rules. Playwright covers the complete guided buyer journey, reload/resume, agent thread separation, connected upload defaults, Files indexing, auction routing, navigation and mobile overflow. Browser screenshots are retained as GitHub Actions artifacts for visual review.
