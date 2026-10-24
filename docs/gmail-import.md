# Optional Gmail label import

Open **Add-ons Manager → Thunder-G → Preferences → Labels**. This feature is
optional: opening settings does not contact Google, read Thunderbird account
credentials, or create local tags. No Gmail messages, assignments or colors are
imported. It is a one-time copy of custom label names and hierarchy, not sync.

## Google connection setup

Thunder-G does not currently ship a shared Google OAuth client. To use this
optional feature, configure your own Google Cloud project:

1. Enable the Gmail API and configure Google Auth Platform's consent screen.
2. Create an OAuth client of application type **Desktop app**. For a project in
   Testing mode, add the Google account you will use as a test user.
3. In the extension's optional connection setup, load the downloaded Desktop
   client JSON, or enter its client ID and client secret if Google supplies one.
   Do not upload the client file or commit personal credentials to the repository.
4. Choose **Connect Google account and fetch labels**. The system browser handles
   sign-in, account selection, consent and 2FA. Return to Thunderbird afterward.

Only OpenID `email` and `https://www.googleapis.com/auth/gmail.labels` are
requested. The label scope's Google consent wording allows seeing and editing
labels; Thunder-G only calls the read-only label-list endpoint. It never calls
message endpoints or writes to Gmail. OpenID user info identifies the actual
verified account that granted access, rather than trusting an email typed by a
user. Workspace administrators may restrict third-party OAuth clients.

Google's Desktop authorization flow uses PKCE, state validation and a temporary
loopback callback through Thunderbird's native OAuth2 module. The default native
external-browser OAuth setting must remain enabled; Thunder-G refuses to fall
back to an embedded login and does not change the setting itself. Sign-in times
out after three minutes; API reads time out after thirty seconds. Thunderbird
153–158.x is the declared compatibility range; future changes to its native
OAuth2 module may require an update.

Client fields and Google access tokens are never saved in extension storage or
in Thunderbird's password manager. Access tokens are used only while fetching
the verified email and label list, then discarded. The verified email and label
names remain in memory while the settings session is open. Disconnect, closing
settings, or disabling the add-on clears them. Disconnect does not revoke the
Google consent grant or delete imported Thunderbird tags. Google account
permissions can be revoked in the account's third-party access settings.

## Preview and dry run

After fetching, **Dry run — preview only** is enabled and a preview is generated
without any local label writes. The source account is shown, and Gmail system
labels (Inbox, Sent, Trash, etc.) are excluded.

The default destination is `GMAIL-Labels`. Select labels individually, exclude
whole branches, or select none. Parent tags needed for the selected paths are
included automatically. For example `Work/Projects` becomes
`GMAIL-Labels/Work/Projects`, creating `GMAIL-Labels` and `GMAIL-Labels/Work` if
necessary. These required parents appear explicitly in the preview.

The proposed-change table lists every local path as **Create**, **Already exists
— skip**, or **Conflict — needs attention**, and shows totals. Names remain exact;
empty segments, surrounding segment spaces, control characters and excessively
long paths are reported as conflicts. Case/Unicode-normalization collisions and
ambiguous existing names block the import rather than overwriting anything.

Changing the selection or destination invalidates the preview. **Cancel preview**
creates nothing. To import, review the table, resolve or exclude conflicts,
uncheck Dry run and explicitly choose **Import selected labels**. Unchecking
alone never imports. The native layer rechecks local label definitions against
the saved plan immediately before creating tags; a changed plan requires a new
preview with no writes. A preview can only be committed once.

## Results and retries

The result reports created, skipped and failed/not-attempted labels. Parent tags
are created first. If a native write fails, import stops and reports the partial
result; successfully created labels remain. Run Preview again to retry, skipping
those already created. No existing tag keys, names, colors or email assignments
are changed or removed. Re-importing the same paths does not duplicate tags.

Native tags are shared by Thunderbird's accounts in the same profile. Other
clients and devices only see them if the mail provider and those clients support
that tag synchronization; this importer does not change Exchange limitations.

## Development validation

`node --test tests/gmail-import*.test.cjs` covers pure planning, hierarchy,
conflicts, duplicate prevention, selection changes, dry-run gating, one-use
previews, partial writes, cancellation and the native OAuth adapter. Authentication
and Google responses are mocked in automated tests. A real Desktop OAuth client
and consenting test account are required for an end-to-end Google sign-in test;
no such client was available during this implementation.
