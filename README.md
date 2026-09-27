# Green Wonderland — your standalone website

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
