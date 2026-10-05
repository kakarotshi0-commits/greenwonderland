# Green Wonderland — your standalone website

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
