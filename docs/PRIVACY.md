# LocalGrowth OS privacy notice

LocalGrowth OS is a localhost application. Workspace settings, drafts, connector configuration, audit events, and lead records are stored in SQLite on the operator's computer. API keys and connector credentials are encrypted locally with the installation's master key. The LocalGrowth project does not receive this local data because it does not operate a hosted backend.

Connected providers receive only the data needed for an operator-requested action. For Google Places discovery, the search query, region/language options, network address, and normal request metadata are sent directly from the local FastAPI process to Google Maps Platform. Google's handling of that request is governed by the [Google Privacy Policy](https://policies.google.com/privacy). Places result content is returned with `Cache-Control: no-store`, kept only in the active browser state, and not written to SQLite. The API key stays in the encrypted connector vault.

If the operator chooses **Crawl public site**, LocalGrowth requests the selected public website with an identified user agent, respects `robots.txt`, and extracts limited business/contact fields from up to four allowed same-site pages. Those independently sourced fields enter the lead vault only after the operator selects **Add to vault**. Durable suppression records prevent later imports from silently reactivating an opted-out identity.

Operators are responsible for securing and backing up their local data directory, choosing retention periods, responding to data-subject requests, and deleting or suppressing records when required. Removing a connector deletes its locally encrypted credentials; uninstalling the software does not automatically delete backups made by the operator.
