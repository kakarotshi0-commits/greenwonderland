# Green Wonderland — your standalone website

## Daily cards (October 2026)

Open **Daily cards** from the navigation. Customers sign in using their in-game CID and a fixed code chosen by the Owner, then reveal up to 3 of 10 cards per day. The game day resets at **6 AM Asia/Dhaka (Bangladesh time)**. Customers sign in again after each reset; their code stays valid until the Owner replaces it. Refreshes, other browsers, code resets and disabling/re-enabling an account do not reset the daily reveal allowance.

Under **Crew → Daily cards · Owner only**, load the controls, enter all 10 reward texts, check **Enable daily cards**, and save. Set each reward’s chance in percent (0–100, up to 2 decimals); the total must equal 100%. Use “Try again” as a no-reward outcome. A 0% entry never appears in new sets. The game starts paused until configured. Each of the 10 cards independently draws a reward using these probabilities when the customer first reveals a card that day. Repeated rewards are possible. Later reward edits affect only daily sets that have not started.

Use **Create customer ID** with the customer's CID, optional name, and an Owner-chosen fixed code (6–32 letters or numbers, case-insensitive). Share the CID and code privately. Customers reuse this same code every day; no new code is needed at 6 AM. Only its hash is stored. Use **Change login code → Save fixed code** to replace a forgotten code. The Owner can disable IDs and view the latest 100 reveals. Customer IDs are separate from crew accounts. Card rewards are displayed and logged; they do not issue wheel codes or automatically change inventory.

Apply `daily-cards.sql` after `customer-orders.sql`, then apply `daily-cards-probabilities.sql` and `daily-cards-fixed-codes.sql`. Existing customer codes remain valid until the Owner changes them. The probability migration preserves current reward names, starts each entry at 10%, and leaves existing daily sets unchanged. Tables and helper functions are private; public RPCs check customer sessions or the current Owner role. Sessions expire at the next 6 AM reset, failed logins are rate limited, and database locking enforces three reveals across concurrent requests. Only revealed card faces are sent to customers. Customer sessions use sessionStorage; a new browser requires signing in again.

Validated with rollback-only SQL tests for reset boundaries, permissions, secret hashing, hidden card data, cross-session limits, idempotent retries, code replacement, disabled accounts and new days. Isolated browser tests cover owner configuration/ID creation, customer login, three reveals, reload persistence and role visibility.

## Customer orders (October 2026)

Customers can use **Add to order**, choose quantities, and submit their in-game name and CID. Phone is optional. The server prices every item from the shared catalogue. Orders remain pending until a crew member with **Use point of sale** permission confirms or declines them under **Customer orders** in the crew panel.

Confirmation atomically records one shared sale and issues one code for the highest enabled wheel threshold reached by the total. Declined orders create neither. The customer's private order link refreshes its status and shows the invoice, employee, and eligible reward code; it can be opened in another browser. Anyone possessing that private link can view that order. Saved order links and a pending submission are retained on the customer's device to support safe retries.

The Owner has **Generate reward code · Owner only** in the crew panel, with a wheel selector and optional note. Manual codes do not create sales. Permission is checked against the shared crew roster on the server. Duplicate confirmations and retried code requests reuse their existing result.

`customer-orders.sql` installs the order tables and RPCs. Direct public access to order tables is disabled. It also makes the former unauthenticated `rw_issue_code` function internal; the current POS uses `gw_issue_sale_reward` with the staff code and saved sale total. Refresh older browser tabs after deployment.

Validation: rollback-only database tests cover authoritative prices, private receipt tokens, every wheel threshold, confirm/decline, role restrictions, repeat requests, and POS compatibility. An isolated browser preview exercises customer submission, employee confirmation/decline, invoice reward codes, and owner manual generation without creating live orders.

Adapted from `green-wonderland.html` in your supplied ZIP. Original branding, embedded images, eight products, crew, roles, attendance and point of sale are preserved.

## Open

Open `index.html` directly, or run `npm start` in this folder and visit http://localhost:4174. Node.js is only needed for the local server; there are no packages to install.

## Use

Choose **Code Sign in**. The supplied owner's name is KakarotSHI and the starter code is `1234`. Other supplied codes: Jordan `1111`, Sam `2222`, Riley `3333`.

Owners can edit products, upload product photos, manage staff and roles, and view sales and attendance. Staff can clock in and use the point of sale according to their role. Finalizing a sale produces a copyable invoice and saves its record. Use the Save buttons after administrative edits.

## Storage and hosting

Changes save in localStorage in the current browser and origin. They survive reloads but do not synchronize to other people, browsers, or devices. Clearing browser data clears saved changes. Export backup downloads the full saved state, including roster codes; keep this file private. It is a data export, not an automatic restore feature.

This is a local roleplay tool. Codes and role restrictions are client-side conveniences, not secure authentication. A shared live staff system needs server-side authentication and a database. The static catalog can be hosted on GitHub Pages or any static host by uploading index.html, but local edits will not change the published catalog for others.

The old dependency on Claude's artifact publishing API has been removed. No Discord messages or other external sales requests are sent. Fonts use Google Fonts with local system fallbacks. Product images are embedded in the HTML.

## Validation

Checked JavaScript syntax, owner sign-in, a two-unit sale totaling $29.98, invoice creation, persistence after reload, and product search. Test data uses a separate storage namespace from this delivered copy.

## Description editor
Sign in and open Admin > Website descriptions. Owners, Admin/Administrator roles, and roles with Edit menu permission can edit the hero tagline, hero description, About text, footer, sign-in instructions, role instructions, empty-search message, and each product description. Choose Save descriptions to apply and persist edits, or Discard edits to restore saved text. Storage remains local to this browser.


## Shift timing
The crew panel shows the current shift in HH:MM:SS, updating every second, plus cumulative time and shift count. After clock-out it shows the last shift duration. Reports include per-person totals and active shift time. Timing is calculated from saved clock events, so reloading does not reset a shift. Closing the page or signing out does not clock out; use Clock out to finish the shift.


## Shared galleries
Crew Gallery shows the latest uploaded portrait for each listed crew member. Community Gallery lets any visitor share a picture, display name and caption. Both galleries store photos in the Supabase gw-gallery bucket and metadata in gallery_photos, so pictures are visible across devices. Visitors can submit photos but cannot overwrite or delete existing database rows or image files. Display names and crew selections are self-reported, not authenticated identities. Manage unwanted records through the Supabase Table Editor and corresponding image files through Storage.

Uploads accept JPG, PNG and WebP up to 10 MB and convert them to JPEG up to 1200 pixels, capped at 1 MB in storage. Public upload endpoints consume your free storage quota; monitor usage in Supabase. The rest of the website (sales, attendance, admin content, roster and roles) remains browser-local. gallery-setup.sql documents the database setup already applied; do not rerun it on the existing project.


Crew photo permission: the website interface allows uploads only when the signed-in role is Owner. This is a local PIN-based interface restriction, not database authorization; the existing public Supabase upload policy remains unchanged. Secure enforcement requires authenticated identities and corresponding database/storage policies.

Owner category editor: Admin > Menu categories allows adding categories and removing them after choosing a destination for existing items. The last category cannot be removed. Categories persist in local browser storage; this does not publish menu changes to other visitors.

Shared catalogue update: catalog.js loads menu, categories and descriptions from Supabase site_catalog, polls every 15 seconds when the page is visible and refreshes on focus. Owner verification uses Supabase email links and a private allowlist. A revision check rejects stale saves. First setup: on the browser with the desired menu, sign in, verify the Owner email under Shared menu access, then click Publish this browser's menu. This explicit first publish preserves previous browser edits. A pre-sync copy is kept under gw-menu-before-sync-v1. Staff PINs, roster, roles, sales and attendance remain local and are never included in the public catalogue. catalog-setup.sql has already been applied; do not rerun blindly.

Daily reward fulfillment: apply `daily-cards-fulfillment.sql` after the fixed-code migration. Every signed-in crew member can search an exact CID and mark revealed rewards done. Completion is recorded once with employee and time. Customers receive reward names only after completion when Displayable is checked; completed displayable history survives the 6 AM reset. Owner displayability and probabilities are captured when a daily set starts, including separate slots with identical names. Existing sets default to displayable but require staff completion before customer display. Login codes and unrevealed cards are never included in employee lookup.

Apply `daily-cards-public-rewards.sql` after fulfillment to show all currently Displayable reward names under the cards, including before customer login. Duplicate names appear once. This collection excludes unchecked rewards and does not expose individual card assignments, customer results, or probabilities. It refreshes every 30 seconds while the page is visible.

Apply `daily-cards-removal.sql` after public rewards. Owner can remove or restore a revealed card in the employee CID lookup, including completed rewards. Removal hides the reward from the customer and other employees, blocks fulfillment, and preserves the three-per-day allowance. Customer cards show Removed by Owner; private removal metadata allows the Owner to restore the prior completion state.

Apply `daily-cards-immediate-reveal.sql` after removal: players now see every actual revealed reward immediately, including Try again. Displayable controls the public collection and completed history, not the immediate card result. Staff completion stays separate; removed rewards remain hidden and unrevealed cards stay private.

Apply `daily-cards-symbol-codes.sql` after immediate reveal to accept symbols in fixed CID codes (6–32 characters, no spaces). New codes preserve symbols, including hyphens, and remain case-insensitive. Existing codes keep their previous normalization until the Owner changes them. Only hashes are stored; changed codes revoke old sessions without changing reveals.
