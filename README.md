# Salt Lake Bees Wrapped

Internal proof of concept: a story-style "Wrapped" recap of a fan's season. All content is sample data.

## Run it

Needs Node 20 or newer. There are no dependencies, so there's nothing to install.

```sh
npm run dev        # http://localhost:3000
npm run dev:lan    # same thing, also reachable from a phone on your Wi-Fi
```

Saving any file in `public/` reloads the page. If port 3000 is taken, the server tries the next free port. Set `PORT=4000` to pick one.

## Live deployment

Production: https://bees.builtbyaether.com

```sh
aws sso login --profile aether-prod   # when the AWS session expires
npm run deploy
```

The deployment uses Aether's production account (`200159632733`) and the `bees-wrapped` CloudFormation stack in `us-east-1`. `infra/hosting.json` manages a private, versioned S3 bucket, CloudFront, an automatically validated ACM certificate, and the `bees` A/AAAA records in the existing `builtbyaether.com` Route 53 zone. HTTP redirects to HTTPS.

Only `public/` is uploaded to S3. The development server, local certificates, and original artwork stay local. The command bundles the CloudFront access function, updates hosting, uploads the site, and waits for CloudFront's cache invalidation to finish. Browsers revalidate files and CloudFront caches them for five minutes between deployments. Existing S3 object versions are retained for 30 days; uploads do not delete old files. No application server is needed.

The default AWS profile is `aether-prod`; `AWS_PROFILE` can select another profile, but the deployment refuses to run against a different AWS account. AWS hosting usage is billed to the production account.

### Password access

The live site opens with a matching password screen introducing Maddie's proof of concept for her Bees job interview. A CloudFront viewer-request function (`infra/access.js`) checks every request before the cache. Only the gate HTML, CSS, JavaScript, and wordmark are public; the story and its media require a signed cookie. Successful access lasts one day. The cookie is Secure, HttpOnly, and SameSite=Lax. Passwords are sent over HTTPS in a request header, never a URL, and checked in AWS; no password or signing key is shipped in browser JavaScript.

The password digest and a random signing key live in the gitignored `.deploy/access.json`. `npm run deploy` requires this file and builds a private `.deploy/hosting.json` containing the edge function; deploy through that command, not the unbundled infrastructure template. AWS administrators can access the deployed function and its configuration.

To change the password, set the `BEES_PASSWORD` environment variable, run `npm run configure:access`, then `npm run deploy`. Configuration generates a fresh signing key, so changing it invalidates existing sessions once deployed. Keep `.deploy/access.json` in a secure backup when moving to another machine, or configure a new password there. Run `npm test` to check access enforcement, cookie validation, and allowed routes.

### Shared links

The Share button shares a link to the slide being viewed. Signed-in viewers' pages ask the edge function for it (`/__share?slide=<key>`): a link of the form `/?s=<slide>.<expiry>.<signature>`, signed with the same key as sessions and valid for 30 days. Anyone who opens it, without the password, is redirected once to collect a `__Host-bees_share` cookie (Secure, HttpOnly, SameSite=Lax) and then sees only that slide, held in place, with a "Someone else's Wrapped" pill. Asking for the story without the link sends them back to it; they can't mint links; forged, edited, or expired links go to the password screen. The cookie also lets their browser load the site's styles, scripts, and media, because the slide needs them, so the page source is readable to a determined recipient. The story they're shown is locked to the one slide. Changing the password ends every shared link. Locally there's no edge function, so links are plain `/?s=<slide>`.

Local `npm run dev` stays open for development; `/gate.html` previews the screen, but its authentication endpoint runs only on CloudFront. The public production URL has the enforced password gate.

## Layout

```
public/
  index.html   slide markup
  styles.css   frame, intro, chrome and start screen
  slides.css   story slides 2+ and their motion system
  app.js       slide player, intro animation, start-screen honeycomb
  slides.js    number reels, season calendar, final-slide fireworks
  sound.js     background music and sound effects
  music.mp3    the music, built from "background music.mp3" by tools/build-music.js
server.js      dev server (static files, live reload, video byte ranges)
```

To add video to a slide, put the file in `public/` and add `<video src="clip.mp4" playsinline preload="auto"></video>` inside that slide's `<section>`. The progress bar follows the video's length, and the video plays with its sound while the music ducks under it (add `muted` for a silent clip).

## Story slides

After the intro come twelve story slides: season tickets, games attended, attendance stats, the MVP card, the Swig report, bobbleheads, Diamond Club, the oddly specific numbers, a favorite moment (a Bees reel, embedded from Instagram), fan type, "See you next season", and a last page with the ticket and share buttons.

The favorite moment is Instagram's own embed, so this page can't see its video play or pause it. Tapping into the embed counts as watching: the slide's timer stops and the music pauses until the viewer taps back on the story or swipes on, and coming back reloads the embed to stop its video. Swipes that start on the embed go to Instagram, so the story moves on from the title area, the arrow keys or the scroll wheel.

The last two slides share one backdrop (`.finale-bg`): a coded night sky, fireworks, and the ballpark photo (`revised-bees-background.png`, whose sky is transparent so rockets rise from behind the stadium). It stays put while you move between them. On the last page it softens: one value eases from sharp to soft over about a second and drives everything with canvas drawing and opacity only, so it looks the same in every browser (Safari doesn't render the CSS backdrop blur here). The photo crossfades through four pre-blurred copies in `public/blur/`, the fireworks crossfade from a sharp canvas to a low-res, blurred one, and a black veil darkens it all. If you replace the photo, regenerate the blurred copies (works in bash and zsh):

```sh
cd public
for spec in 1:4:2 2:9:2 3:16:3 4:26:3; do   # level:blur:downscale
  n=${spec%%:*}; rest=${spec#*:}; sigma=${rest%%:*}; div=${rest#*:}; pad=$((sigma * 4 + 8))
  ffmpeg -v error -i revised-bees-background.png -vf "format=rgba,premultiply=inplace=1,pad=iw+2*${pad}:ih+2*${pad}:${pad}:${pad},fillborders=left=${pad}:right=${pad}:top=${pad}:bottom=${pad}:mode=smear,gblur=sigma=${sigma},crop=iw-2*${pad}:ih-2*${pad}:${pad}:${pad},unpremultiply=inplace=1,scale=iw/${div}:-1:flags=lanczos,format=rgba" /tmp/blur${n}.png -y
  cwebp -quiet -q 82 -alpha_q 90 -m 6 /tmp/blur${n}.png -o blur/ballpark-blur-${n}.webp
done
```

A slide with `data-hold`, like the last page, stays up until the viewer leaves: it has no timer and no progress bar, and tapping doesn't pause it.

Every element animates in three phases. Give it `class="fx"` plus one class from each column, and set `--d` to delay its entrance:

| Phase | When | Classes |
| --- | --- | --- |
| Spawn | the slide opens | `rise`, `pop`, `zoom`, `drop`, `slide-l`, `slide-r` (default: fade) |
| Idle | while the slide shows | `float`, `sway`, `breathe` (default: a slow drift) |
| Despawn | the slide is left | cascades automatically; override with `--despawn` |

Keep idles smooth: an idle animates only `transform`, while spawns use `translate`, `scale`, `rotate` and `opacity`. If a spawn and an idle animate the same property, Chrome runs both on the main thread instead of the GPU, and they stutter whenever the page is busy. For the same reason, give an element a static tilt with `rotate`, not `transform`.

Numbers use reels adapted from the Adobe Bricks score wheel: `<span class="wheel" data-value="1504" style="--d:1.2s"></span>`. Each place rolls on its own reel, the reels stop left to right with a small overshoot, and the number pulses as it lands. `data-pace` slows a roll down and `data-slots` pads it with empty scoreboard plates.

Pausing the story (tap or space bar) freezes all of this, including the reels, and reduced-motion settings show each slide in its finished state.

## Sound

Nothing plays on the start screen. The music starts on the tap that starts the story, and the mute button is the one control that stays up through the intro. The music fades in from a section break about halfway through `background music.mp3` and then loops a 24-bar stretch of it whose two ends match, so the loop is seamless. `public/music.mp3` is that part of the song, prepared for looping. If you change the song, the start and loop points in `tools/build-music.js` have to be found again for the new track; for this one, `node tools/build-music.js` rebuilds the file (needs ffmpeg).

The sound effects are synthesized in `sound.js` (there are no effect files) and cued by the slides' own animations, so they stay in time with the motion and stop when the story pauses. Each one is panned toward where its element sits. To hear one on its own, open the console and run `sound.preview('card')` (`sound.names` lists them all). Set `sound.log = true` to see each effect named as it plays. `LEVEL` at the top of `sound.js` sets the music and effect volumes.

Pausing the story pauses the music. The mute button covers both, and a slide's video sound too. With reduced-motion settings the music still plays, but the effects are off, since everything on a slide would appear, and sound, at once. On iPhone the sound plays even with the ringer switch off, like a video.

## Testing on a phone

`npm run dev:lan` prints an `https://` `Network:` URL. Open it on a phone on the same Wi-Fi. The first time, macOS may ask whether Node can accept incoming connections; allow it.

It's https because phones only allow sharing on secure pages. The server makes its own certificate (kept in `.certs/`, remade if your network address changes), so the phone warns about it on the first visit: on iPhone tap **Show Details**, then **visit this website**; on Android tap **Advanced**, then **Proceed**.

The Share button sends a story-sized "Season Wrapped" image (made from the slides' own numbers), which is what puts Instagram, Messages and Photos in the share sheet. Where a device can't share images it shares the link, or copies it.
