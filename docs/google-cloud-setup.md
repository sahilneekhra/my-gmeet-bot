# Google Cloud and Google Meet API Prerequisites

Complete this setup before running the application. It covers only Google Cloud and Google Meet REST API configuration; it does not cover application code or package installation.

## 1. Create or select a Google Cloud project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Use the project selector at the top of the page.
3. Select an existing project, or choose **New Project**.
4. Enter a clear project name, choose the appropriate organization/location if prompted, and create the project.
5. Confirm that the project is selected before continuing.

Each developer should create or select their own project. Do not reuse OAuth credentials from another project.

## 2. Enable the Google Meet REST API

1. In the Cloud Console, open **APIs & Services** → **Library**.
2. Search for **Google Meet REST API**.
3. Open it and select **Enable**.

Enabling the API does not grant access to meetings by itself. A user must still authorize the application through OAuth.

## 3. Configure Google Auth Platform / OAuth consent screen

1. Open **Google Auth Platform** in the Cloud Console. In some layouts, this is **APIs & Services** → **OAuth consent screen**.
2. Start the configuration if it has not already been completed.
3. Select **External** as the user type.
4. Provide the required app information, including the application name, support email, and developer contact email.
5. Save and continue through the setup screens.

### Add test users

In **Testing** status, only accounts explicitly listed as test users can complete authorization.

1. In Google Auth Platform, open **Audience** (or the **Test users** section).
2. Add the Google accounts that will test the application.
3. Save the changes.

Add the exact Google account that will sign in and grant access. Another account will be blocked in Testing mode, even if it can access the same meeting.

## 4. Add the Google Meet OAuth scope

1. In Google Auth Platform, open **Data Access** (or the **Scopes** section of the consent configuration).
2. Choose **Add or remove scopes**.
3. Add this scope:

   ```text
   https://www.googleapis.com/auth/meetings.space.readonly
   ```

4. Save the selected scopes.

This allows read-only access to Google Meet meeting-space and related conference-record data the authorized account is allowed to access.

## 5. Create OAuth client credentials

1. Open **Google Auth Platform** → **Clients** (or **APIs & Services** → **Credentials** in older layouts).
2. Select **Create client** / **Create credentials** → **OAuth client ID**.
3. Select **Web application**.
4. Give the client a recognizable name, such as `Local development`.
5. Under **Authorized redirect URIs**, add exactly:

   ```text
   http://localhost:8000/oauth2callback
   ```

6. Create the client.

Google displays a **Client ID** and **Client secret**. Download the client configuration JSON from the client details page and securely store it for local application configuration.

## 6. Protect the OAuth client JSON

The downloaded client-secret JSON contains OAuth credentials, including the client ID and client secret. Treat it as a secret:

- Keep it out of source control or in a secure secrets store.
- Add its filename to `.gitignore`.
- Never commit it, paste it in an issue, or share it publicly.
- If exposed, rotate or delete the OAuth client secret in Google Cloud and update local configuration.

An `.env` file is separate application configuration. It does **not** automatically replace the downloaded Google OAuth client JSON. It can only be used instead when the application explicitly reads the required values and builds the same OAuth client configuration.

## 7. Testing and publishing status

New External OAuth apps commonly begin in **Testing** status.

- In Testing, only listed test users can authorize.
- Add every account used for local testing to the test-user list.
- Publishing to production may require further Google verification, especially for sensitive or restricted scopes.

For development, Testing status with approved test users is typically enough.

## What the authorized account can read

The Google Meet REST API can return conference records and participant information for meetings the authorized account can access. OAuth does not grant access to every meeting in an organization; results depend on the signed-in account’s own permissions and what Google Meet recorded.

## Transcript availability

Transcript data exists only when Google Meet actually generated a transcript for the conference. A successful connection can return conference and participant data but no transcript.

For the test meeting used in this project, **Transcribe** was unavailable/premium. In that situation, an empty transcript response is expected and is not, by itself, an API or OAuth failure. Use a supported transcription feature, enable it during a meeting, and allow time for Google to generate the transcript before testing transcript retrieval.

## Troubleshooting

### Invalid scope

- Confirm the OAuth request uses the exact intended Google Meet scope.
- Confirm that scope is added and saved under **Google Auth Platform** → **Data Access**.
- Re-authorize after scope changes; an old grant may not include the new permission.

### Redirect URI mismatch

Google matches redirect URIs exactly. Ensure the OAuth client contains the exact URI used by the app:

```text
http://localhost:8000/oauth2callback
```

Changes to protocol, port, path, trailing slash, or hostname (for example, `localhost` versus `127.0.0.1`) cause a mismatch.

### `missing code verifier` or `invalid_grant`

These usually indicate an OAuth authorization-code flow configuration issue rather than a Google Meet permission issue.

- Keep authorization and callback in the same browser/session flow.
- Do not reuse an authorization code; it expires quickly and can be exchanged once.
- If using PKCE, retain the code verifier from the authorization request and send it when exchanging the callback code.
- Confirm the client ID, redirect URI, and OAuth client configuration all belong to the same Google Cloud project and client.

## Completion checklist

- [ ] Google Cloud project selected
- [ ] Google Meet REST API enabled
- [ ] External Google Auth Platform / OAuth consent configuration completed
- [ ] Test accounts added while in Testing
- [ ] `https://www.googleapis.com/auth/meetings.space.readonly` added under Data Access
- [ ] OAuth 2.0 **Web application** client created
- [ ] `http://localhost:8000/oauth2callback` registered as an authorized redirect URI
- [ ] Downloaded OAuth client JSON stored locally and excluded from Git
- [ ] Test account authorized and able to access a Google Meet conference
