---
description: "Understand the local Thunder-G compatibility bridge for DKIM Verifier, including its required patch, verification boundaries and optional BIMI downloads."
---

# DKIM Verifier compatibility bridge (local prototype)

**This is not automatic compatibility with an unmodified DKIM Verifier installation.** DKIM Verifier 6.4.0 has no public external API for another reader to verify an exact message and supply its context to the original popup. The local prototype requires an explicitly patched provider. Thunder-G never silently patches another extension at startup. Provider updates may replace this patch.

## Verification status and optional popup prototype

The conversation reader displays status chips from the provider's actual results.
Its DKIM button is hidden. Experimental popup support remains in the bridge for
local development, but is not exposed by the current conversation UI.
The prototype uses the provider's original `content/displayAction.html` with
bounded, message-specific contexts; expired contexts never resolve to a different
selected message. Native-tab behavior is unchanged.

The bridge accepts external requests only from `thunder-g@vschiavoni`. The provider's existing `AuthVerifier`, preferences, DNS and key policy perform verification; no sender or success result is synthesized. Results work with `saveResult` disabled. Late results cannot populate a replaced conversation.

Build the explicit local provider patch using:

```
python3 integrations/build-dkim-compat.py /path/to/pristine-dkim-6.4.0.xpi /tmp/dkim-compat.xpi
```

The script asserts the reviewed version and expected source anchors, leaves the original archive untouched, and refuses already patched input. The original plugin's popup is reused rather than copied into Thunder-G. Installation is a separate explicit step with backups of both extension archives and the installation state. Betterbird was not changed.

For distribution, the provider needs a supported API equivalent to verify/get-popup-context/release-context, plus a popup message resolver. Simply installing the two published extensions does **not** currently provide this prototype's behavior. Do not market it as automatic compatibility until a supported provider interface exists and has been tested with unmodified release packages.

Earlier local prototype checks exercised the original signature-details popup
and Reverify action. The current reader hides that button; this does not establish
compatibility with unmodified provider releases.

## Optional BIMI image downloads

The [settings guide](../docs/settings.md#sender-logos) describes **Show sender logos with BIMI**, off by default. The setting explicitly discloses remote image downloads and that the logo host can see the user's IP address. After aligned DKIM success, the reader looks up `default._bimi.<From domain>` and, only if no record exists, the organizational domain resolved with Thunderbird's public suffix service. Empty `l=` opts out.

Only the DNS-declared HTTPS SVG is downloaded: no logo directories, favicons, certificate requests, credentials or referrer. Redirects are rejected. Downloads have a ten-second deadline and a 64 KiB limit. Only static self-contained SVG is accepted as a data-image; downloaded markup is never inserted into the document. This is logo discovery, not BIMI/VMC identity certification. Local contact photos have priority. A bounded one-hour session cache includes successful and absent results. Disabling stops new discovery, removes displayed BIMI logos and ignores late responses.

Live verification: sample signed messages displayed DNS-published logos.
