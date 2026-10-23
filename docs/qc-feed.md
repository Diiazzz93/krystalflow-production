# QC feed

A read-only web address an outside assistant can call to collect submitted quality-control forms. It does not create, change, or delete anything.

## Address

```
GET https://<your-published-site>/api/public/hooks/qc-feed?since=<ISO timestamp>&until=<optional ISO timestamp>
```

Use the address of the published KrystalFlow site (the one staff open in the browser), then add `/api/public/hooks/qc-feed`.

`since` is required. The feed returns forms created after that moment. `until` is optional. When you send it, the feed also stops at that moment.

Each call returns at most 500 forms, oldest first. Every submitted form is included, whether it passed or failed. A form is submitted when someone presses **Submit QC log**. That is the same list as the QC timeline. An unsaved draft on the tablet is not included, because it is not saved yet.

Signatures and photos are never included.

## What `approved` and `flagged` mean

`flagged` is true only when the result is Fail.

`approved` means a supervisor sign-off was recorded. It is true when any of these is present:

- A supervisor name (`supervisorName`, or the older `supervisorSignoff` text when the name field is blank). The QC history shows this as "Sign-off: …".
- The stored `qcApproved` flag is true.

`approved` is not the same as "this form was submitted". A passed form with no supervisor name is still included. Its `approved` value is false.

`qcApproved` is a poor signal on its own, which is why passed forms that are visible on the timeline were missing from the first version of this feed. The form sets that flag to true only when the result is Pass **and** someone drew on the signature pad. The Submit button does not require a drawing or a name. A passed form with no drawing is still saved, still appears on the timeline, and is stored with `qcApproved` false. Forms saved before that flag existed do not have the field at all. The timeline does not look at `qcApproved`. It lists every saved form and uses the Pass or Fail result. Nothing else in the app reads the flag either. The feed therefore does not use it to decide which forms to return. When the flag is true, it still counts as sign-off, because that is how the current form records "a signature was drawn on a pass". The signature picture itself is never sent.

## Header

Send this header on every call:

```
x-qc-feed-secret: <the secret you saved>
```

The server compares it with the secret named `QC_FEED_SECRET`. If the header is missing or does not match, the answer is `401`. If `QC_FEED_SECRET` has not been set on the server, the answer is `500`.

## Response

```json
{
  "generated_at": "2026-10-23T21:00:00.000Z",
  "since": "2026-10-01T00:00:00.000Z",
  "until": null,
  "count": 1,
  "next_since": "2026-10-20T04:15:00.000Z",
  "items": [
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "pallet_code": "KS-AB23",
      "pallet_number": 1,
      "result": "Pass",
      "approved": true,
      "flagged": false,
      "operator_name": "Alex",
      "supervisor_name": "Sam",
      "m_number": "M-100",
      "pallet_quantity": 48,
      "pallet_type": "CHEP",
      "notes": "Checked at end of shift",
      "log_date": "2026-10-20",
      "created_at": "2026-10-20T04:15:00.000Z",
      "updated_at": "2026-10-20T04:16:00.000Z",
      "title": null,
      "job": {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "customer": "Example Customer",
        "product": "Example Cleaner 500ml",
        "sku": "EX-500",
        "line": "Line 1",
        "unleashed_sales_order_number": "SO-10001"
      }
    }
  ]
}
```

A failed pallet has `"result": "Fail"` and `"flagged": true`. It can also have `"approved": true` when a supervisor name was entered. A form that is not tied to a production job has `"job": null` and uses `"title"` for the name typed on that form. `supervisor_name` is the name from the form, using the older sign-off text when the newer name field is blank.

`count` is how many forms are in this answer. `next_since` is the time of the last form, or the same `since` you sent when there are none. To fetch the next batch, call again with `since` set to the previous `next_since`. If `count` is 500, call again — there may be more.

## Set QC_FEED_SECRET in Lovable Cloud

1. Make a long random value. On a Mac or Linux computer, run `openssl rand -base64 48` and copy the result. A password manager can generate one too. Use at least 40 characters. This value is a password. Do not put it in git, email, or a chat.
2. Open this project in Lovable.
3. Open the Cloud area for the project and find Secrets (environment variables for the server).
4. Add a secret. The name must be exactly `QC_FEED_SECRET`. Paste the random value as the value.
5. Do not name it `VITE_QC_FEED_SECRET`. A name that starts with `VITE_` is sent to the browser. This secret must stay on the server.
6. Publish the app again (the Publish / redeploy action). Saving the secret does not update the live site on its own. The live site only sees the secret after you publish.

The same name can also be added as a Cloudflare Worker secret if you deploy outside Lovable. Lovable passes project secrets through to the worker when you publish.

## Test with curl

Replace the site and the secret. Pick a `since` far enough back to include the forms you expect.

```bash
curl -sS -D - \
  -H "x-qc-feed-secret: YOUR_SECRET" \
  "https://YOUR-SITE/api/public/hooks/qc-feed?since=2026-01-01T00:00:00.000Z"
```

- A correct secret returns JSON like the example above, with status `200`.
- A wrong or missing secret returns status `401` and `{"error":"Unauthorized"}`.
- If you have not saved the secret and published, the status is `500` and the error says the QC feed secret is not configured.

Optional end time:

```bash
curl -sS \
  -H "x-qc-feed-secret: YOUR_SECRET" \
  "https://YOUR-SITE/api/public/hooks/qc-feed?since=2026-10-01T00:00:00.000Z&until=2026-10-23T00:00:00.000Z"
```
