# Brag Plan: BringIt

## What is this app?
BringIt is a peer-to-peer campus delivery network for CUET (Chittagong University of Engineering and Technology) students — post what you need from the city or across campus with a small Taka reward, and a fellow student already heading that way picks it up and delivers it to your dorm hall.

## The angle
A clean, honest product demo. No irony needed — the app genuinely solves a real campus problem (wasted commute time, buried WhatsApp messages, overpriced couriers). The video shows the actual flow: post a need → a student picks it up → it arrives at your hall. The hook is the relatable campus pain, the payoff is seeing how simple the fix is.

## Hook (first 2-3 seconds)
Text slam: "Need meds from the city?" — immediately relatable for any university student stuck on campus. Paired with the emerald-to-dark gradient background pulled from the app's welcome banner.

## Key moments (the middle)
- The dispatch board with live request cards showing real routes (Central Cafeteria → Shahid Hall), Taka rewards (৳50, ৳80), and urgency badges — the core feed that makes the product feel alive.
- The 1-tap errand creator with campus location presets (Central Cafeteria, Central Library, Campus Gate) and quick reward chips (৳20, ৳30, ৳50) — shows how fast posting is.
- The live chat thread between requester and deliverer with quick replies ("On the campus bus") — proves coordination is built-in, not an afterthought.

## Outro / punchline
"BringIt — Never waste a commute again." + the CUET Verified badge + the live URL. Clean, earned, no oversell.

## User flow worth showing
1. Student posts an errand: selects "Central Cafeteria" → "Shahid Hall", types "Lunch order", sets ৳50 reward.
2. Dispatch board shows the request live with route, reward badge, and urgency tag.
3. Another student accepts — chat opens with quick reply "On the campus bus" — item delivered, rating given.

## Tone
- Preset: app-store
- Creative direction: campus-warm product showcase, honest and functional
- Interpretation: Clean feature-card reveals, medium pacing, warm emerald palette. No hype, no irony — the product's utility speaks for itself. Professional but not corporate.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
- Background: slate-900 (#0f172a) for hero scenes, slate-50 (#f8fafc) for UI scenes
- Accent: emerald-600 (#059669) / emerald-800 (#065f46)
- Text: white on dark, slate-900 (#0f172a) on light
- Display font: Plus Jakarta Sans (800 weight)
- Body font: Plus Jakarta Sans (400-600 weight)
- Strongest visual element: The emerald-to-dark gradient welcome banner with the pulsing "CUET Campus Network" badge and the live delivery radar cards with route arrows and ৳ reward pills

## Share copy (draft)
Built BringIt for CUET students — post what you need, a student already heading that way brings it to your hall. Campus deliveries that actually work.

## Audio direction
- Role: warm bed
- Music: happy-beats-business-moves-vol-1-by-ende-dot-app.mp3 (120 BPM, upbeat, clean)
- Music treatment: start at 0s, volume 0.35, gentle fade-out over last 2s
- Music cue guidance: bundled preset at `assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`; tempo 120.19 BPM; target strong cues at ~5.03s for feed reveal, ~10.02s for create-errand moment, ~17.02s for chat/outro. Beat grid available from 3.02s onward at ~0.50s intervals.
- Audio-reactive treatment: subtle; use music RMS to make the emerald gradient glow breathe and card borders gain slight presence on bass. No waveform/equalizer visuals.
- SFX posture: moderate; motion-matched; professional restraint
- Audio-coupled moments:
  - Scene 1 hook text slam — impact cue on text entrance
  - Scene 2 request cards arriving — card slide sounds, one per card
  - Scene 3 create form interaction — subtle click on tap of location preset
  - Scene 4 chat quick reply — soft UI click
  - Scene 5 logo landing — bell impact for final payoff
- Restraint rule: no sound should compete with the music bed or feel like a game UI

## Storyboard

### Scene 1 — Hook — 3s
Dark emerald-to-slate gradient background (from the app's welcome banner). Bold white Plus Jakarta Sans text slams in:
"Need meds from the city?"
Then below it, softer: "A student already going can bring it."
Sequential/interaction: none — text reveals in sequence (headline first, subline 0.8s later)
Audio intent: attention-grabbing but warm
Audio-coupled idea: impact hit on headline entrance
Music: upbeat bed fading in
Transition mood: clean → Scene 2

### Scene 2 — The Feed — 5s
Light slate-50 background. Recreate the dispatch board: 3 request cards slide in one by one, each showing:
- Title (e.g. "Lunch from Cafeteria", "Paracetamol from City Pharmacy", "Thesis prints")
- Route with arrow: "Central Cafeteria → Shahid Hall"
- Emerald ৳ reward pill: "৳50", "৳80", "৳40"
- Urgency badge (green Low, amber Medium, red High)
The cards stack vertically with the emerald accent borders from the real UI.
Sequential/interaction: yes — 3 cards arrive one by one (card 1 at beat, card 2 next beat, card 3 next beat)
Audio intent: rhythm builds with each card landing
Audio-coupled idea: card-slide or card-place sound on each card entrance
Transition mood: smooth → Scene 3

### Scene 3 — Post in Seconds — 5s
Show the create-request form UI: the 1-tap campus location presets ("Central Cafeteria", "Central Library", "Campus Gate") as pill buttons. Simulate a tap on "Central Cafeteria" (it highlights emerald). Below: quick reward chips "৳20 ৳30 ৳50 ৳80 ৳100" — simulate tapping "৳50" (it fills emerald). A "Post Errand" button glows at the bottom.
Sequential/interaction: yes — simulate tapping location preset, then reward chip, then the Post button
Audio intent: satisfying interaction feedback
Audio-coupled idea: subtle click on each simulated tap
Transition mood: clean → Scene 4

### Scene 4 — Live Chat — 4s
Show the mission chat thread: two message bubbles. Student A: "Picked up your lunch 🍔". Student B quick-reply pill: "On the campus bus". Timestamp below each. The chat has the emerald header with the request title.
Sequential/interaction: yes — message 1 appears, then quick-reply tapped, then message 2 slides in
Audio intent: warm, conversational
Audio-coupled idea: soft drop sound on each message bubble appearing
Transition mood: soft → Scene 5

### Scene 5 — Outro — 3s
Dark emerald gradient returns. The BringIt logo (Package icon + "BringIt" wordmark from the header) enters centered. Below: "Never waste a commute again." Below that: the CUET Verified badge pill. Then the URL: bring-it-delivery.netlify.app
Sequential/interaction: none — logo, tagline, badge, URL reveal in quick succession
Audio intent: confident payoff
Audio-coupled idea: bell impact on logo entrance, music fades under
Transition mood: end

**Music mood for this video:** upbeat
**Audio summary:** Warm upbeat bed carries throughout; card-slide SFX punctuate the feed reveal; subtle interaction clicks on form taps; a single bell impact lands the logo; music fades gently under the outro.

