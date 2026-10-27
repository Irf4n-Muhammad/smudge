# Running the test wedding

Stage 5 of the work plan: one real wedding, end to end, judged by four numbers. This is the
operator's side; the owner's preparation guide lives with the work plan.

## Before

1. Deploy in production mode (`docs/deploy.md`). Check that `FORMA_DATA_DIR` sits on a persistent
   disk with room for the album: plan for about 2 GB per wedding (ADR 0038).
2. The host makes the invite at `/m`, from their own account. Note the moment's id: it is the
   part after `/m/` in the link.
3. The host sends the link from **Send on WhatsApp** and writes down how many invitations went
   out. That number is the denominator for the RSVP rate.
4. Ask the host to name the photographer's account in **Album → Fotografer** once they joined.

## On the day

- A phone or tablet at the entrance opens **Layar pintu** (`/m/<id>/door`), plugged in, with the
  screen kept awake. The QR changes every 30 seconds, so it cannot be printed.
- Venue Wi-Fi is shared by everyone: door scans and uploads allow 600 per 10 minutes per address.
  If many guests share one address and hit the limit, they can switch to mobile data.

## After

The album locks three days after the date (ADR 0039). Read the numbers at the lock and again 30
days after the date:

```sh
FORMA_DATA_DIR=/data npm run moment-report -- <moment id> --invited <invitations sent>
```

The report reads a copy of the database, so it is safe while the server runs. It prints counts
only, never names or phone numbers. The four numbers the test is judged by:

| Number                              | Line in the report                        |
| ----------------------------------- | ----------------------------------------- |
| Guests who answered                 | Answered the RSVP                         |
| Guests who made an account          | Made a Smudge account for it              |
| Guests who added a photo            | Added a photo                             |
| Guests who started their own moment | Made a moment of their own within 30 days |
