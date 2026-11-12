---
description: "Understand contact photos, DKIM verification and optional BIMI logos in Thunder-G, including integration prerequisites and privacy limitations."
---

# Sender photos, DKIM and BIMI logos

A contact photo, a DKIM result and a BIMI logo describe different things. A logo
is not proof that a message is safe, and enabling logos does not enable sender
verification by itself.

## What appears in the reader

The reader uses a local contact photo when available; otherwise it can show its
usual initials/avatar. **Show sender logos with BIMI** is an optional addition,
off by default, for senders that publish a suitable logo and pass the required
aligned DKIM check.

The reader can display DKIM states such as verified, unsigned, failed or not
checked. An absent result is not a successful result. The local DKIM integration
uses the verifier's policies rather than synthesizing a success badge.

## Prerequisites before enabling logos

1. Read the [local DKIM integration notes](../integrations/README.md). The current
   integration is a local compatibility prototype, not automatic support from
   installing the two published add-ons.
2. Use that documented integration only on its reviewed provider version. Do not
   assume an ordinary DKIM Verifier installation supplies the required bridge.
3. Enable **Preferences → Sender logos → Show sender logos with BIMI**.
4. Open a message with an aligned DKIM result and a sender domain that publishes
   a usable BIMI record. Contact photos still take priority.

No public-provider compatibility is implied by these steps. The integration
notes record the supported local patch and the limits of its live checks.

## Network and caching behavior

The reader looks up the sender's `default._bimi` record, falling back to the
organizational domain only when no record exists. It downloads the advertised
HTTPS SVG directly; the host can see your IP address. There is no external logo
search service, favicon lookup or certificate download in this path.

Redirects are rejected. Downloads have a ten-second deadline and a 64 KiB limit;
only static self-contained SVG is accepted as a data-image. This is logo discovery,
not BIMI/VMC identity certification. Successful and absent results are cached for
one hour during the session.

Turning the switch off stops new discovery/downloads, restores the usual avatars
and ignores late responses. It cannot undo a request already observed by a remote host.

## If a logo is missing

- Check whether a contact photo is already taking priority.
- Confirm the required integration returned aligned DKIM success for this message.
- Check whether the sender publishes a logo at all; an empty `l=` explicitly opts out.
- Invalid SVG, a redirect, an oversized image or a network failure leaves the usual avatar.
- A cached missing result can remain for the session cache lifetime.

Do not enable unrelated remote message content merely to obtain a BIMI logo.
See [privacy and local data](privacy.md) for the other optional network features.
