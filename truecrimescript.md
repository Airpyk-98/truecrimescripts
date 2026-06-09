---
name: truecrimescript
description: "Use this skill whenever the user asks to generate a true crime YouTube video script as a CSV file. This skill covers the full pipeline: researching a real story, structuring it for maximum YouTube retention, writing Flux-optimized image prompts, and outputting a correctly formatted CSV — then saving it to Google Drive."
license: MIT
metadata:
  author: Airpyk-98
  version: "1.0.0"
---

# truecrimescript.md

## Skill: True Crime YouTube CSV Script Generator

Use this skill whenever the user asks to generate a true crime YouTube video script as a CSV file. This skill covers the full pipeline: researching a real story, structuring it for maximum YouTube retention, writing Flux-optimized image prompts, and outputting a correctly formatted CSV — then saving it to Google Drive.

---

## Trigger Phrases

- "create a true crime script"
- "generate a YouTube CSV for [story/topic]"
- "make a true crime video script"
- "write a [N]-row CSV for [crime story]"
- "create a teaser CSV for [story]"
- Any request for a true crime YouTube script in CSV format

---

## Step 1 — Research the Story

Before writing a single row, **always use web_search to verify the story is real and factual**.

- Search for the story using `web_search` with specific queries (victim names, location, date, crime type)
- Use `web_fetch` on credible news sources (BBC, ITV, Sky News, The Guardian, CPS press releases, court records) to gather:
  - Full verified timeline of events
  - Names, ages, roles of all parties
  - Exact dates (crime, arrest, trial, verdict, sentencing)
  - Key evidence details
  - Outcome and aftermath
  - Any prison, parole, or post-conviction developments
- **Never fabricate or assume details** — every fact in the VO must be verifiable
- If the story cannot be verified, stop and tell the user

---

## Step 2 — Story Architecture (Retention Psychology)

Structure the rows using YouTube true crime retention psychology. Every script must follow this arc regardless of total row count:

### For Full Scripts (83 rows recommended):

| Row Range | Purpose |
|-----------|---------|
| 1–5 | **Viral cold-open hook** — reveal the most shocking outcome FIRST before any backstory |
| 6–15 | **Backstory setup** — who, where, when. Build emotional investment in victims |
| 16–25 | **The twist or deception** — the single most disturbing detail of the case |
| 26–35 | **Investigation and arrest** — evidence, breakthrough moments |
| 36–45 | **Trial and conviction** — courtroom drama, sentencing |
| 46–55 | **Post-conviction developments** — prison life, appeals, further events |
| 56–65 | **The climax event** — the most recent or most dramatic development |
| 66–75 | **Aftermath and public reaction** — divided opinions, family statements |
| 76–79 | **Philosophical close** — the unanswered moral question |
| 80–81 | **Emotional resolution** — tribute to victims |
| 82–83 | **CTA close** — subscribe, comment prompt, channel sign-off |

### Re-hook Placement (MANDATORY):
Place deliberate re-hook lines at approximately rows **15, 20, 40, 60, and 75** to catch viewers who paused or drifted. Re-hooks should:
- Tease a detail not yet revealed
- Ask a rhetorical question
- Directly address the viewer ("Stay with me", "Wait — let that land")

### For Teaser Scripts (15 rows):

| Row Range | Purpose |
|-----------|---------|
| 1 | Shock opener — reveal the outcome before context |
| 2–3 | Minimal backstory — just enough to create emotional investment |
| 4–5 | The most disturbing single detail — the "wait, what?" moment |
| 6–7 | Fast-forward to the climax event |
| 8–9 | The attack/event described but **deliberately withheld** — "watch the full video" |
| 10–11 | Nation's reaction — split moral camps |
| 12 | Family/victim dignity moment — the most emotional beat |
| 13 | The unanswered question — make them need closure |
| 14 | Explicit bridge to full video — tell them exactly what they will get |
| 15 | Binary CTA — force a choice that drives comments |

---

## Step 3 — CSV Format Rules

### Column Headers (EXACT — case sensitive, no deviation):

```
Serial number, image prompt, video prompt, voice over prompt
```

### Column Rules:

**`Serial number`**
- Sequential integers starting at 1
- No formatting, just the number

**`image prompt`**
- Every prompt must be **completely unique** and tailored to the specific scene of that row
- Never reuse the same setting, angle, or atmosphere across rows
- Must include ALL of the following keywords: `hyper realistic`, `8K ultra detail`, `photorealistic`, `cinematic`
- Must describe: subject/scene, lighting, mood, camera angle, era/period details
- Must end with a **negative prompt** embedded within the field using this format:
  `Negative prompt: [comma-separated list]`
- Standard negative prompt terms to always include:
  `cartoon, anime, illustration, 3D render, CGI, blurry, distorted, deformed, watermark, text overlay, pixelated, low quality`
- Add scene-specific negatives (e.g. `children visible`, `graphic content`, `recognizable faces`, `modern equipment in period scene`)
- **Never depict real identifiable people directly**
- **Never depict victims, especially children, in any form** — use symbolic imagery (empty chairs, shirts, flowers, memorial candles, abandoned shoes)
- Model target: **4-bit quantized Flux 1.0 Schnell** (self-hosted) — prompts must be detailed enough to compensate for the model's quantization limitations

**`video prompt`**
- Rotate randomly through these motion types — never use the same one twice in a row:
  - `Slow dramatic zoom`
  - `Subtle slow tilt`
  - `Slow smooth pan`
  - `Slow dramatic pan`
  - `Slow rotating shot`
  - `Slow low angle tilt`
  - `Slow sweeping shot`
  - `Slow push-in`
  - `Slow pull-back`
  - `Slow orbital shot`
  - `Slow top-down tilt`
  - `Slow fade-in with zoom`
- For teaser scripts or when instructed, use `-` as the value

**`voice over prompt`**
- **ONE SINGLE SENTENCE per row** — no exceptions
- The sentence must be simple, direct, and punchy
- It must narrate exactly what is happening in the scene the image prompt depicts
- Write as a voiceover narrator would speak — not a social media caption, not a news headline
- No filler words, no "um", no hedging
- Emotional weight must be carried by word choice, not by length
- The VO drives the story; the image visualizes the VO

---

## Step 4 — Tone and Style Reference (Ray William Johnson Narration Style)

Model the tone and narration style after content creator Ray William Johnson's true crime and cultural storytelling videos. The script must sound conversational, highly engaging, fast-paced, and punchy. Key style rules:

- **Conversational & Direct Audience Address**: Write as if telling a crazy story to a friend. Start sentences or lines with conversational transitions (e.g., "So imagine this...", "Now, you'd think...", "Yeah... it's exactly what it sounds like.").
- **High-Energy Hook-First Structure**: Grab attention immediately on the first line. Frame the situation as shocking or unbelievable (e.g., "This teenager did the absolute unthinkable just to get a new phone," "Meet [Name]. He thought he was the smartest person in the room. Spoiler alert: he wasn't.").
- **Dramatic "...UNTIL..." Transitions**: Build up suspenseful setups and mark twists with bold, capitalized transitions like "...UNTILLLLL...", "...but then, things took a turn...", "...and that's when things get weird."
- **Sarcastic Rhetorical Commentary**: Interject with dry humor, sarcasm, or disbelief at the criminals' stupidity or the absurdity of their actions (e.g., "Like, honestly, who does that?", "Brilliant plan, right?", "It's almost impressive how much they wanted to get caught.").
- **Simple, Punchy, Fast-Paced Language**: Use simple words for maximum impact. Keep sentences short and declarative. Avoid dry, formal, or academic documentary-style reporting.
- **Respect for victims always**: While perpetrator actions are mocked or treated with dry sarcasm, the tone must always remain respectful to victims. Every script must end with a tribute that honours the victims by name.
- **The "Moral of the Story" Closing**: Conclude the script with a cynical, comedic, or punchy moral lesson (e.g., "Moral of the story: Just get a job," "Moral of the story: Don't write a book detailing your crimes.").
- **Audience Engagement Outro**: End the video by directly asking the audience a binary or highly engaging question to drive comments (e.g., "What do you think? Did the punishment fit the crime, or should they have got more? Let me know in the comments.").

---

## Step 5 — Output and Delivery

### CSV Formatting:
- Wrap every field in double quotes to handle commas within content
- Use UTF-8 encoding
- Validate the CSV parses to exactly 4 columns across all rows before saving
- Filename convention: `[subject]_truecrime_[type].csv`
  - Example: `huntley_truecrime_youtube_csv.csv`
  - Example teaser: `huntley_truecrime_TEASER_15rows.csv`

### After CSV is generated, ALWAYS:
1. Save the CSV file to `/mnt/user-data/outputs/`
2. Call `present_files` to make it downloadable
3. Upload the CSV to Google Drive using the `Google Drive:create_file` tool with `disableConversionToGoogleType: true` and `contentMimeType: text/csv`
4. Return the Google Drive **file ID** to the user in the chat

---

## Step 6 — Quality Checklist

Before delivering any CSV, verify:

- [ ] All facts are verified from real news sources
- [ ] Column headers match exactly: `Serial number, image prompt, video prompt, voice over prompt`
- [ ] Every image prompt is unique to its row and scene
- [ ] Every image prompt contains `hyper realistic`, `8K ultra detail`, and a `Negative prompt:` section
- [ ] No image prompt depicts victims, especially children, in any direct form
- [ ] Video prompts rotate through the motion list with no consecutive repeats
- [ ] Every voice over prompt is exactly ONE sentence
- [ ] Re-hooks appear at the correct retention checkpoints (rows 15, 20, 40, 60, 75 for full scripts)
- [ ] Script ends with a victim tribute and a binary CTA that drives comments
- [ ] CSV saved to outputs folder AND uploaded to Google Drive
- [ ] Google Drive file ID returned to user

---

## Example Row (Full Script)

```csv
Serial number,image prompt,video prompt,voice over prompt
1,"Hyper realistic close-up of a cracked smartphone screen displaying a BBC News breaking notification in bold white text on dark background, blurred busy London commuter street visible behind, cold morning light, fingerprints on glass, notification badge glowing red, subtle lens flare, shallow depth of field, photorealistic, 8K ultra detail, cinematic documentary style. Negative prompt: cartoon, anime, illustration, CGI, blurry notification text, watermark, extra phones in frame, wrong platform logo, pixelated",Slow dramatic zoom,"So imagine this: you think you've committed the perfect crime, right? Well, meet [Name] — a guy who thought he was smarter than everyone."
```

---

## Notes

- Always prefer UK true crime stories where possible (higher emotional resonance for the channel's target audience)
- Stories with a strong irony, moral dilemma, or unexpected twist perform best
- The Soham / Huntley case (March 2026) is the reference script for tone, pacing, and structure — use it as a benchmark when in doubt
- When the user requests a teaser, the teaser should psychologically compel the viewer to seek out the full video, not summarise it
