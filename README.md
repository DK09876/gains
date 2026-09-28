# Gains

Plan your workouts, watch the form clips, and log what you lift. Runs on a
Raspberry Pi on your own tailnet, alongside [LifeOS](https://github.com/DK09876/LifeOS)
and [MTG Tracker](https://github.com/DK09876/MTGTracker). Nothing leaves the
Pi except YouTube embeds, which your browser loads from YouTube.

## What it does

**Today** asks which workout you are doing and walks you through it one
exercise at a time:

- the exercise's clip at the top, looping silently
- its **target** (*3 × 10 · 95 lb each side*) and **what you did last time**
- a row per set, filled in with a best guess: the set above, else last
  time's, else the target. The usual case is one tap on ✓. **−/+** move the
  weight by 5 lb, and a change carries down to the sets you have not ticked.
- **Next** / **Back**, or *All exercises* to jump anywhere

Every tick is saved as you go, so a locked phone, a reload or a different
device picks up where you were. There is one workout under way at a time;
the screen is kept awake while it is.

**Finishing** shows what you did and, for every exercise where you lifted
more than the target, suggests raising it: *Hip Thruster 95 lb → 100 lb
[Set to 100]*. **Nothing changes unless you tap it.** A lighter day never
suggests lowering a target.

**Plan** is your workouts and their exercises: name, section (*Before*,
*After*, *Pick one*), sets, reps, target weight and a note on it (*each
side*), notes, and any number of **clips**:

| Clip | Shown as |
|---|---|
| Upload a GIF or video from your phone | the file itself, stored on the Pi (up to 150 MB) |
| YouTube link, Shorts included | a muted, looping embed |
| Giphy page or a direct `.gif` / `.mp4` link | the GIF or video |
| anything else (Instagram, TikTok) | a link out, since those only embed through their own scripts |

**Import from Google Sheets.** In the sheet, *File → Download →
Comma-separated values*, then pick the file on the Plan tab. It shows what it
found before adding anything. The layout it reads:

```
Legs,,,                          a name in the first column starts a workout
,Squat-All glute regions,,       an exercise: the name, then notes after "-" or "("
,Before,,                        a label whose next line is indented further
,,15 Minute Walk,Low Intensity     is a section, and the lines under it are in it
,Hip Thruster,,,,95 lbs          a number with a unit in any later cell is the target
,,MC Gillis 3,,https://...       any link is a clip
```

A line that sits under no workout is listed as left out rather than dropped.

**History** lists finished workouts; open one for every set, and any target
it still suggests raising.

**Profiles** keep people apart, as MTG Tracker's do: each has its own
workouts and history. A new browser asks who is using it, and anyone can add
themselves. It is separation, not a login. To start from a friend's plan,
*Plan → Copy a friend's workout* copies it into yours, targets and clips
included, to change as you like.

**Weights are in pounds.**

## On a phone

Open it in Safari (with Tailscale connected), **Share → Add to Home Screen**,
and it installs as **Gains**: full screen, its own icon. If the Pi cannot be
reached it shows a page saying so with **Try again**.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm test
```

| Variable | Default | |
|---|---|---|
| `GAINS_DB_PATH` | `./data/gains.db` | the SQLite file |
| `GAINS_MEDIA_DIR` | `media/` beside the database | uploaded clips |

## On the Pi

Runs under systemd as `gains` on 127.0.0.1:3002, from
`~/development/gains`. Unit files are in `deploy/`.

```bash
bash scripts/backup.sh --force
git fetch && git reset --hard origin/main
npm ci && npx next build
sudo systemctl restart gains
```

It has its own hostname, `https://gains.<tailnet>.ts.net`, from a separate
Tailscale node on the same Pi, `tailscaled-gains.service`, in userspace mode
with its own state and socket. This is the same arrangement as MTG Tracker's,
for the same reasons (see its README). It serves the app with:

```bash
sudo tailscale --socket=/run/tailscale-gains.sock serve --bg 3002
```

To let a friend in without giving them the rest of your tailnet, share the
`gains` machine with them from the Tailscale admin console.

**Backups**: `gains-backup.timer` runs `scripts/backup.sh --verify` nightly.
It snapshots the database to `~/backups/gains/` (skipped when unchanged,
newest 30 kept) and mirrors the clips to `~/backups/gains/media/`, keeping
any that were deleted from the app.

Profiles can also be managed on the Pi. Stop `gains` first, since two
processes writing the WASM SQLite file at once is unsafe:

```bash
node scripts/profile.cjs list
node scripts/profile.cjs add kevin "Kevin"
node scripts/profile.cjs rename kevin "Kev"
```

## Tech

Next.js 16, React 19, Tailwind 4, TypeScript. SQLite through
`node-sqlite3-wasm`, since the native addon segfaults on the Pi.

## License

MIT
