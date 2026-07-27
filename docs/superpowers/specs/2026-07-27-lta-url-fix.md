# Spec: Fix LTA URL (Bug Fix)

## Status
Approved

## Problem

The `websiteUrl` in `src/index.ts` points to the old LTA traffic camera page:
```
https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras/woodlands.html
```

This URL has been replaced by LTA with a new unified traffic cameras page.

## Solution

Swap the hardcoded URL in `src/index.ts` to the new LTA URL.

## Changes

### `src/index.ts`

- Update the `websiteUrl` constant:
  ```ts
  const websiteUrl =
    "https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras.html";
  ```

### Snapshot Analysis

The new page HTML structure was verified against `snapshot.html`:
- Image URLs: `<img src="https://datamall.lta.gov.sg/trafficsmart/images/...">` — same format, `trafficsmart` filter in cheerio selector is still valid
- Timestamp markup: `<div class="timestamp"><span class="left">...</span></div>` — identical to old page
- `src/fetch_images.ts` cheerio selectors require **no changes**

## Scope

- `src/index.ts`: 1 line changed
- `src/fetch_images.ts`: no changes
- `.env.example`: no changes
- No new dependencies
