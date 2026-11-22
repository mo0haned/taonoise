# TaoNoise

A white-noise and ambient sound mixer that runs entirely in your browser. **33 sounds, all synthesized live with the Web Audio API**: no audio files, no downloads, no server, no account. Layer as many as you like, set each one's volume and character, and let the scenery follow the mix.

- Noise colours, rain (light, heavy, window, roof, tent), thunder, storm, wind, ocean, stream, waterfall, drips, underwater, campfire, fireplace, forest, crickets, birds, fan, train, airplane, cafe, typing, heartbeat, singing bowl, binaural drone, deep space.
- Presets, "Surprise me", saved mixes (local storage), share links (the mix lives in the URL hash), sleep timer with a gentle fade-out, optional fade-in, master volume and mute, mini player, Media Session (lock-screen play/pause and title), optional screen wake lock, light and dark themes, works offline after the first load.
- First load is about 25 KB gzip (one inlined HTML file).

## How the sounds are made

Every sound is a small Web Audio graph plus a lookahead scheduler (a 250 ms timer schedules random events 2.5 s ahead on the audio clock). Nothing loops audibly: beds are noise buffers (10 s, stereo, with an equal-power cross-faded seam, started at a random offset) whose filters and gains wander randomly, and the events (drops, pops, gusts, chirps) are drawn from random processes.

| Family | Synthesis |
| --- | --- |
| White, pink, brown, blue, violet | White noise; pink by the Paul Kellet filter; brown by a leaky integrator; blue and violet by differentiating pink and white. Normalised, DC-free. |
| Rain | A pink bed (high-pass, presence peak, low-pass) plus a Poisson stream of 6-20 ms band-passed noise bursts as drops. Window adds resonant glass ticks and thuds, roof adds hollow low plinks, tent is duller and softer. Character sets drop rate and bed level. |
| Thunder | Brown noise through a low-pass that sweeps down, with a distance-dependent attack and several random "rolls"; close strikes add a crack. Events arrive randomly (character sets how often). Storm is heavy rain + gusting wind + thunder. |
| Wind, wind in trees | Pink noise through a band-pass whose centre and gain wander; a narrow whistling band; trees add a bright leaf-rustle band that flutters with the gusts. |
| Ocean | Brown body and white foam shaped by one slow wave at a time: swell up, the filter opens on the crest, foam hisses, then it recedes. Wave period is random. |
| Stream, waterfall | Stream: pink bed plus dozens of tiny rising sine "bubbles" per second. Waterfall: low roar, mid wash and a bright spray band. |
| Drips, underwater | Sine plops with a fast upward glide, a quieter echo and a reverb send. Underwater: dark brown noise with a drifting low-pass and low bubbles. |
| Campfire, fireplace | Brown roar and mid body with random flutter, plus Poisson crackle: ticks, snaps, rare loud cracks and small clusters. Fireplace is warmer, with a chimney hollow. |
| Forest, crickets, birds | Forest: high-passed noise whose gain jumps every 30-140 ms (leaf rustle). Crickets: six detuned sine "voices" gated in chirps of 3-4 pulses with their own period and pan. Birds: sine phrases with random glides (rising whistles, trills, two-note calls) into a reverb. |
| Fan, train, airplane | Brown rumble, pink air and tonal hum with a blade-pass flutter; train adds a rhythmic double clack whose pace follows speed; airplane adds engine tones that beat slowly. |
| Cafe, typing | Cafe: seven "voices" made of noise through two moving formant band-passes with random syllable gating, plus room tone and occasional cup clinks. Typing: bursts of key clicks with a low thock and pauses. |
| Heartbeat, bowl, drone, space | Heartbeat: lub-dub sine thumps under womb noise. Bowl: inharmonic partials with beating pairs and long decays, struck at random. Drone: two sines panned hard left and right a few Hz apart (binaural beats, use headphones) over a soft pad. Space: detuned saws through a slowly moving low-pass, sub noise, reverb and a faint shimmer. |

Each sound is level-matched by `js/levels.js`, written by `npm run calibrate` from offline renders.

The scenery (`js/viz.js`) blends a gradient toward the mix (rain steel blue, water deep blue, fire ember, forest green, space nebula) and draws rain streaks, ripples, fire glow, fog, stars and thunder flashes, driven by an `AnalyserNode` on the master output.

## Run and build

```sh
npm test            # unit tests, no install needed (Node 20+)
npm run build       # dist/: one inlined index.html + sw.js + manifest + icons; prints gzip size
npm run serve       # serves dist/ on http://localhost:8767 (audio needs a user tap to start)
npm run e2e         # real-browser checks; needs playwright-core and Chrome (see CONTRIBUTING.md)
```

`dist/` is plain static files; host it at a domain root (the manifest and service worker use root paths).

## Privacy

Nothing is sent anywhere. The page stores your last mix, saved mixes, theme and options in local storage, and an offline copy of the app in the browser cache. No cookies, analytics, third-party scripts or fonts. Share links keep the mix after the `#`, which browsers never send to a server. See the in-app `#/privacy` page.

## Limits

- Browsers start audio only after a tap or click; the page never autoplays.
- **iOS and background audio:** iOS suspends Web Audio when the page is backgrounded or the screen locks. TaoNoise routes its output through a media element (MediaStream) on iOS and sets Media Session metadata, which keeps playback going in most cases, but Apple does not guarantee it, and a phone call or Siri interrupts it (tap play again). Installing the page to the home screen helps.
- A low-power mode or aggressive battery saver can throttle timers; the scheduler looks 2.5 s ahead to ride out short stalls.
- Many layered sounds with many events (heavy rain + fire + cafe) use noticeable CPU on old phones.
- Recording to WAV is not included.
- Sounds are synthesized approximations, tuned by ear and by measurement, not recordings.

## License

MIT, see [LICENSE](LICENSE).
