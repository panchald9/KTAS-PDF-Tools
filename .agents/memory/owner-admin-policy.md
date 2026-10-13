---
name: Owner administration and visitor privacy
description: Product intent and privacy constraints for website management and visitor reports.
---

The owner wants a private panel to manage ads and PDF, image and text tools and see daily visitors by country, IP address, device and operating system.

**Why:** The user requested administration and real visitor reports, not simulated analytics.

**How to apply:** Keep management and individual visitor records behind verified owner authorization. Never grant administration to the first person to register or to ordinary signed-in visitors. Keep public tools usable without accounts.

Visitor analytics and advertising require an informed opt-in; renew consent when adding new tracking purposes. Reports describe consented browsers, not identified people or all website traffic.

**Why:** Previous cookie consent covered advertising only, while visitor analytics introduces IP storage and an anonymous browser identifier. Reusing the old choice would not inform visitors about the new purpose.

**How to apply:** Honor Essential only, Do Not Track and Global Privacy Control. Keep raw records for at most 30 days, restrict IPs to owner reports, and never include document contents, filenames or URL queries.

Use local IP-country lookup and describe countries as approximate or Unknown.

**Why:** Country estimation should not require disclosing visitor IPs to an external service, and proxies/VPNs can make location inaccurate.

**How to apply:** Do not add external geolocation services without approval or claim IPs establish identity or exact location.

Validate narrow owner-report layouts with populated traffic data, including very long referrer hosts and page paths, not just empty reports.

**Why:** The overview can look correct without records while real referrer text forces nested report rows wider than the phone viewport.

**How to apply:** Keep report labels shrinkable or truncated with their full text available, and wide tables horizontally scrollable within their own container rather than the whole page.