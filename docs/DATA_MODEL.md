# Property workspaces and saved data

The four tabs describe four views of a property case. They do not each create a separate copy of its records.

| View | Owns | References |
| --- | --- | --- |
| Auction | Participation, bids, deadline, result | Property and transaction |
| Messages | Participant conversations | Documents, signing events, service requests |
| Coordination | Service requests and work status | Property, transaction, report documents |
| Files | A searchable-by-eye document index | The same documents shown in Messages |

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

The demo uses fictional PDFs generated on demand; no uploaded file bytes are saved. Replies and provider actions are scripted examples. Signing has no legal effect and sends no email. Browser storage is not an authenticated vault: anyone using that browser profile can inspect the synthetic records, including other demo roles. Clearing site data removes this progress. When storage is unavailable, the page explicitly reports that progress is temporary.

## Connected accounts

The connected workspace uses the existing backend and data schema. This frontend redesign does not migrate or delete existing records.

- Clerk handles account identity. Server authorization selects the transaction role.
- The existing Exchange Durable Object stores shared auction and participation records.
- Cloudflare D1 stores users, roles, transaction participants, threads, messages, tasks, document metadata, signature recipients, service requests and audit events.
- The private R2 bucket stores uploaded originals and completed PDFs. Worker routes authorize document downloads.
- SignWell handles signing requests and completed-document notifications in the configured test mode. Stripe participation remains deferred while live payments are disabled.

Connected uploads now default to the selected participant conversation. Authorized MREO staff may choose another sharing scope explicitly. Files lists all documents the server permits that viewer to access; Messages displays the permitted documents belonging to the selected conversation, plus documents shared with all participants. Existing document sharing settings are retained.

Access follows the current server model: transaction buyers see the buyer thread, sellers see the seller thread, and providers see the provider thread. Authorized agent/admin accounts have broader staff access. Provider access is currently at the transaction-role level, not isolated per provider company. Cloudflare/account administrators and the services processing the records also have their respective operational access. This is not end-to-end encrypted messaging.

The frontend suppresses document activity for documents outside the visible file set. Before using confidential customer records, the backend's broader activity feed also needs server-side event filtering: its current summaries can include another participant's document filename or task title. Per-provider assignment restrictions and retention/deletion policies likewise need a separate production hardening pass. UI filtering alone is not an access-control boundary.

## Existing illustrative provider pages

The older service walkthroughs remain available under Coordinate and from **Explore service pathways**. They use their existing browser state, separate from guided-run snapshots. They do not synchronize with a new guided run. Links from a connected workspace to these examples are explicitly labeled as illustrative and do not dispatch providers or change the connected transaction.

## Verification

`npm test` checks run isolation, independent status transitions, document/thread references and the existing server/auction rules. Playwright covers the complete guided buyer journey, reload/resume, agent thread separation, connected upload defaults, Files indexing, auction routing, navigation and mobile overflow. Browser screenshots are retained as GitHub Actions artifacts for visual review.
