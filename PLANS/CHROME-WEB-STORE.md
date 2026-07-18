# Chrome Web Store — credentials + automated publish setup

How to get `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, and `CHROME_REFRESH_TOKEN` so the release workflow can publish a new extension version on every `v*.*.*` tag without a human in the loop.

Three credentials, four places to visit. The $5 Chrome Web Store publisher fee is the only money you'll spend.

---

## Step 1 — Chrome Web Store publisher account ($5, ~5 min)

1. Open https://chrome.google.com/webstore/devconsole/
2. Sign in with the Google account that should own the extension. For a project you might sell or transfer later, **create a dedicated Google account** (e.g. `publisher@moltypass.app`) rather than tying it to your personal account.
3. Accept the developer agreement.
4. Pay the **one-time $5 fee**. (This unlocks publishing across all your extensions forever — it's not per-extension.)
5. Fill in your developer contact email + verify it. CWS will email there for review feedback.

**Optional but recommended:** create a Publisher Group (Developer Dashboard → Account → Publisher Groups) so the listing reads as "Moltypass" rather than your personal name.

---

## Step 2 — Upload the extension manually, once (~5 min)

You need an existing item in the store before the API can publish updates to it. The first upload has to be a human click.

1. From the Dashboard, click **+ New Item**.
2. Upload a placeholder zip of `dist/` (or the real first build).
3. Fill the minimum store-listing fields (you can polish later):
   - Title: `Moltypass — AI API Key Vault`
   - Summary (132-char): use the one from `store/listing.md`
   - Description: use the one from `store/listing.md`
   - Category: Developer Tools
   - Privacy policy URL: `https://moltypass.app/privacy`
4. **Save as draft.** Don't submit for review yet.
5. **Copy the extension ID** from the URL — it's a 32-char lowercase string like `aabbccddeeffgg…`. Store it for the workflow.

> Note: this manual step is **only required once.** From now on, every release can be uploaded + published by the API.

---

## Step 3 — Google Cloud project + Chrome Web Store API (~5 min)

The CWS publish API is a regular Google API; you authorize against it with OAuth.

1. Open https://console.cloud.google.com/.
2. Click the project dropdown at the top → **New Project**. Name it `Moltypass`. Click Create.
3. Make sure the new project is selected at the top.
4. Sidebar → **APIs & Services → Library**.
5. Search for `Chrome Web Store API`. Click it → **Enable**.

---

## Step 4 — OAuth 2.0 Client ID + Secret (~5 min)

This is where you get **CHROME_CLIENT_ID** and **CHROME_CLIENT_SECRET**.

### 4a — Configure the OAuth consent screen (first time only)

1. Sidebar → **APIs & Services → OAuth consent screen**.
2. **User type:** External. Create.
3. Fill required fields:
   - App name: `Moltypass`
   - User support email: yours
   - Developer contact: yours
4. **Scopes** step: click **Add or Remove Scopes**, search for `chromewebstore`, check the box for `https://www.googleapis.com/auth/chromewebstore`. Save.
5. **Test users** step: add the Google account you used in Step 1 (the CWS publisher account) as a test user. Save.
6. **Summary** step: review, then click **Back to Dashboard**.
7. Click **Publish App** so the OAuth screen leaves "Testing" status. (Sensitive scope, but Google does not require verification review for this specific scope at personal-use scale. Required because refresh tokens issued in Testing status expire in 7 days, which would break unattended publishing.)

### 4b — Create the OAuth client

1. Sidebar → **APIs & Services → Credentials**.
2. **+ Create Credentials → OAuth client ID**.
3. **Application type: Desktop app** (this is the part that matters — desktop type gives you a long-lived refresh token).
4. Name: `Moltypass CWS publish`.
5. Click **Create**.
6. A modal shows two values — **save both, you'll need them in Step 5 and Step 6:**

| Repo secret name | Value to copy |
|---|---|
| `CHROME_CLIENT_ID` | The "Client ID" string |
| `CHROME_CLIENT_SECRET` | The "Client secret" string |

---

## Step 5 — Generate the refresh token (~3 min)

This is **CHROME_REFRESH_TOKEN**. You generate it once, manually, by completing an OAuth flow with your own client credentials.

The easiest path: **Google OAuth 2.0 Playground.**

1. Open https://developers.google.com/oauthplayground.
2. Click the **⚙ gear icon** in the top right.
3. Check **Use your own OAuth credentials**.
4. Paste the Client ID + Client Secret from Step 4b. Close the gear menu.
5. On the left, under **Step 1 — Select & authorize APIs**, scroll all the way to the bottom of the scope list. There's an empty text field labeled **Input your own scopes**.
6. Type:

   ```
   https://www.googleapis.com/auth/chromewebstore
   ```

7. Click **Authorize APIs**. A Google sign-in window opens.
8. **Sign in with the same Google account that owns your CWS publisher account** (the one from Step 1). Approve the consent screen. You'll see a "Google hasn't verified this app" warning — that's expected; click "Advanced → Go to Moltypass (unsafe)" since it's your own app.
9. You'll redirect back to OAuth Playground with an **authorization code** in the left pane.
10. Click **Exchange authorization code for tokens**.
11. The right pane now shows a JSON response with `access_token` and `refresh_token`. **Copy the refresh_token value** — that's your `CHROME_REFRESH_TOKEN`.

⚠️ The refresh token only displays once. If you lose it, repeat Step 5.

---

## Step 6 — Store all three in GitHub Actions secrets (~2 min)

1. Open https://github.com/opencolin/moltypass/settings/secrets/actions.
2. Click **New repository secret** three times, adding:

| Name | Value |
|---|---|
| `CHROME_CLIENT_ID` | from Step 4b |
| `CHROME_CLIENT_SECRET` | from Step 4b |
| `CHROME_REFRESH_TOKEN` | from Step 5 |
| `CHROME_EXTENSION_ID` | from Step 2 |

Done. You should never see these values again.

---

## Step 7 — Wire the release workflow

Add this to `.github/workflows/release.yml` (after the existing build step that produces `dist/moltypass-<TAG>.zip`):

```yaml
- name: Publish to Chrome Web Store
  uses: mnao305/chrome-extension-upload@v5
  with:
    file-path: dist/moltypass-${{ github.ref_name }}.zip
    extension-id: ${{ secrets.CHROME_EXTENSION_ID }}
    client-id: ${{ secrets.CHROME_CLIENT_ID }}
    client-secret: ${{ secrets.CHROME_CLIENT_SECRET }}
    refresh-token: ${{ secrets.CHROME_REFRESH_TOKEN }}
    publish: true   # set false for the very first auto-upload while you verify
```

`mnao305/chrome-extension-upload` handles the OAuth refresh dance, the multipart upload, and the publish call. No bespoke code needed.

On the first automated tag push, set `publish: false` so the action uploads the zip but leaves it as a draft. Verify the draft in the dashboard. Then flip `publish: true` for subsequent tags.

---

## Gotchas you'll only notice in production

| Symptom | Cause | Fix |
|---|---|---|
| Refresh token expires after 7 days | OAuth consent screen still in "Testing" status | Step 4a.7 — Publish App |
| 401 on publish call | Refresh token + Client ID/Secret were from different Cloud projects | Regenerate refresh token (Step 5) with the same Client ID + Secret you'll put in GH secrets |
| 403 `INVALID_DEVELOPER` on publish | The Google account that authorized in Step 5 is not the CWS publisher | Step 5.8 — sign in with the publisher account, not your personal one |
| Listing assets reset to empty after auto-publish | The `chrome-extension-upload` action only ships the zip; listing copy / screenshots stay as configured in the dashboard | Edit listing once in the dashboard; the API doesn't touch it |
| Item stuck in "Pending review" after every push | Some changes (host permissions, scope) re-trigger review | Expected for first publish + any permission change; non-permission updates publish within minutes |

---

## What this gets you

A single `git tag v1.0.1 && git push origin v1.0.1` from your laptop produces a new Chrome Web Store version, signed, uploaded, and published — without you ever opening a browser.

Then when v1.1 lands and `moltypass exec` ships, you can replace `git tag … && git push …` with `moltypass exec gh release create …` and the rotation story closes: even the Chrome publisher's Google account credentials live in the Moltypass vault, not your shell history.
