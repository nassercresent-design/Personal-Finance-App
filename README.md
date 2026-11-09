# Finance

A personal expense tracker that runs as a web app (PWA) on your iPhone.
No accounts, no server, no cost. Everything is stored on the phone.

## What's in this version

- Home: your balance (starting balance + income − expenses), money in and out this month, recent entries
- Add / edit / delete money going out (expense) and coming in (income), with category, date, payment method and note
- Activity: everything grouped by day, with your balance after each entry, plus search and an in/out filter
- Spending: a chart of where your money went each month, by category; tap a category to see its entries
- Settings: starting balance, back up (JSON), export to CSV, restore from a backup, delete all data
- Backup reminder on Home when the last backup is more than 7 days old
- Works offline after the first visit

## Files

All files sit side by side, with no folders, so uploading through the GitHub website can't miss anything.

```
index.html             page shell
manifest.webmanifest   app name, icon and colours for "Add to Home Screen"
sw.js                  service worker (offline support)
styles.css             all styles
app.js                 screens, navigation, backup/restore
db.js                  on-device database (IndexedDB)
utils.js               categories, money and date helpers
*.png                  app icons
```

Money is stored in paise (whole numbers), so ₹12.50 is saved as 1250. This keeps totals exact.

## Try it on your computer

Service workers and the database need the files served over http, not opened by double-clicking.

```
cd finance-app
python3 -m http.server 8000
```

Open http://localhost:8000 in Chrome or Safari. Use the browser's device toolbar to see it at phone size.

## Put it online for free (GitHub Pages)

1. Create a free GitHub account and a new **public** repository, e.g. `finance`.
2. Click **Add file → Upload files**, select all 11 files inside this folder and drag them in.
3. Go to **Settings → Pages**, set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
4. After a minute your app is at `https://<your-username>.github.io/finance/`.

The code is public, but your data is not. It never leaves your phone.

## Install on your iPhone

1. Open the GitHub Pages link in **Safari** (not Chrome).
2. Tap **Share → Add to Home Screen**.
3. Open it from the home screen icon from now on. Data added in a Safari tab and in the home screen app are kept separately on iOS, so stick to the icon.

## Updating the app

1. Change the files and upload them again.
2. In `sw.js`, change `const CACHE = 'finance-v5'` to `'finance-v6'` (and so on) every time.
3. Close and reopen the app on your phone once or twice to pick up the new version.

Your data is not affected by updates.

## Backups

Settings → **Back up everything** opens the share sheet. Save the file to Files or Google Drive.
To restore, use **Restore from backup** and pick that file. Restoring replaces what's on the phone.

Do this weekly. If you delete the home screen icon or clear Safari's website data, anything not backed up is gone.

## Ideas for next steps (in Claude Code)

- Recurring payments
- Bank statement import (CSV)
- Custom categories and accounts
- Month picker and insights charts
- PIN lock
- Dark mode
