# LTA URL Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the hardcoded LTA traffic camera URL in `src/index.ts` from the old `woodlands.html` page to the new unified `traffic-cameras.html` page.

**Architecture:** Single-line constant change in `src/index.ts`. No scraper logic changes needed — the new page HTML structure has been verified against `snapshot.html` and the existing cheerio selectors in `fetch_images.ts` are identical.

**Tech Stack:** TypeScript, existing deps only.

---

### Task 1: Update `websiteUrl` constant

**Files:**
- Modify: `src/index.ts:15-16`

- [ ] **Step 1: Update the URL constant**

Read `src/index.ts` lines 15-16, then edit:

```ts
const websiteUrl =
  "https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras.html";
```

Replace the existing value.

- [ ] **Step 2: Run TypeScript build to verify no errors**

```bash
cd /home/user/sg-custom-bot/sg-custom-bot && npm run build
```

Expected: completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "fix: update LTA traffic camera URL to new onemotoring page

Co-Authored-By: francis <work@francisyzy.com>"
```
