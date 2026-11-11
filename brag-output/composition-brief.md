# Hyperframes Composition Brief: BringIt

## Objective
Create a short app-store-style launch video for BringIt — a peer-to-peer campus delivery platform for CUET students.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: `c:\Users\alifs\Downloads\bringit`
- Primary files read: `index.html`, `src/index.css`, `src/pages/HomePage.tsx`, `src/pages/BrowseRequestsPage.tsx`, `src/pages/CreateRequestPage.tsx`, `src/components/ChatBox.tsx`
- Product name: BringIt
- Tagline / strongest claim: "Never waste a commute again."
- Meta description: "Fast, trusted peer-to-peer campus deliveries and errands for CUET students."
- Key UI or visual moment to recreate: Dispatch board feed cards with emerald ৳ reward pills and route arrows; 1-tap campus location presets; live chat quick replies
- Copy that must appear verbatim:
  - "Need meds from the city?"
  - "A student already going can bring it."
  - "BringIt"
  - "Never waste a commute again."
  - "CUET Verified"
  - "bring-it-delivery.netlify.app"

## Creative Direction
- Tone preset: app-store
- Creative direction: campus-warm product showcase, honest and functional
- Interpretation: Clean feature-card reveals, medium pacing, warm emerald palette. Professional but not corporate. The product's utility speaks for itself.
- Angle: Campus students waste hours commuting for small errands. BringIt turns every student's trip into a delivery opportunity. The video demonstrates the real flow — not marketing, but the working product.
- Hook: "Need meds from the city?" — universal campus pain
- Outro / punchline: "Never waste a commute again." — earned, not oversold
- LOOK: Dark emerald-gradient hero scenes; light slate-50 UI scenes; Plus Jakarta Sans bold; emerald-600 accent pills; clean white cards with subtle shadow
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign

## Visual Identity
- Background: #0f172a (slate-900) for hero scenes, #f8fafc (slate-50) for UI scenes
- Text: white on dark, #0f172a on light
- Accent: #059669 (emerald-600) / #065f46 (emerald-800)
- Display font: Plus Jakarta Sans (800 weight, from Google Fonts)
- Body font: Plus Jakarta Sans (400-600 weight)
- Visual references from the project: emerald gradient welcome banner, pulsing CUET Campus Network badge, delivery radar cards with route arrows, ৳ reward pills, urgency badges

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 3s — Dark gradient, "Need meds from the city?" + "A student already going can bring it."
2. The Feed — 5s — 3 delivery request cards slide in with routes, ৳ rewards, urgency badges
3. Post in Seconds — 5s — Create form with location presets, reward chips, simulated taps
4. Live Chat — 4s — Mission chat: message bubbles + quick reply "On the campus bus"
5. Outro — 3s — BringIt logo + "Never waste a commute again." + CUET Verified + URL

## Audio
- Audio role: warm bed
- Audio arc: upbeat bed carries throughout; interaction SFX punctuate the middle; single bell impact lands the logo; music fades gently under the outro
- Music: happy-beats-business-moves-vol-1-by-ende-dot-app.mp3
- Music treatment: start at 0s, volume 0.35, gentle fade-out in last 2s
- Music cue guidance: bundled preset at `C:\Users\alifs\.agents\skills\brag\assets\music\cues\happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`; tempo 120.19 BPM; target strong cues at ~5.03s for feed reveal, ~10.02s for create form, ~17.02s for logo landing. Beat grid from 3.02s at ~0.50s intervals.
- Audio-reactive treatment: subtle; use music RMS/bass to make the emerald gradient glow breathe and card presence pulse. No waveform/equalizer visuals.
- Audio-coupled moments:
  - Scene 1 — impact hit on headline entrance
  - Scene 2 — card-slide sounds on each card arrival (beat-grid aligned)
  - Scene 3 — subtle click on each simulated tap
  - Scene 4 — soft drop on message bubble appearance
  - Scene 5 — bell impact on logo entrance
- SFX selection guidance: professional restraint; motion-matched; card sounds for feed cards, clicks for interactions, one bell for payoff
- SFX analysis guidance: C:\Users\alifs\.agents\skills\brag\assets\sfx\sfx-analysis.md
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume based on the implemented animation.
- Audio files: copy the chosen music and any Hyperframes-selected SFX into `brag-output/composition/assets/`

## Hyperframes Instructions
Load the composition-building Hyperframes skills. Use the brag plan and this composition brief as the creative contract. Do not write a SPEC.md or propose storylines.

Requirements:
- Show at least one real UI, copy, or visual element from the source project.
- Keep all text readable in the final render.
- Keep the video within 15-25 seconds.
- Include the planned music/SFX layer.
- Use music cue metadata as optional timing hints.
- Major reveals may move toward nearby strong cues within about 0.15s.
- Run `hyperframes check` before render.
- Keep creation and rendering local.

