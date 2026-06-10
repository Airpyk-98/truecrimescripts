# Kokoro Video Automation App Walkthrough

Welcome to the **Kokoro Video Automation Control Center** guide. This document provides step-by-step instructions on how to use the AI storytelling skill to generate true crime script CSV files, upload them to the web controller application, trigger the Kaggle GPU rendering pipeline, and download the final compiled MP4 video.

---

## Part 1: Installing the True Crime Script Skill

To allow an AI coding assistant (like Antigravity) to generate premium true crime YouTube scripts automatically, you must first equip it with the `truecrimescript` skill.

### 1. Give the AI the GitHub Skill Link
Provide the AI agent with the repository link containing the skill instructions:
> **Skill GitHub Repository:** [https://github.com/Airpyk-98/truecrimescripts.git](https://github.com/Airpyk-98/truecrimescripts.git)

Tell the AI:
> *"Please install the `truecrimescript` skill globally from this repository: https://github.com/Airpyk-98/truecrimescripts.git"*

### 2. Verify Global Installation
The AI will clone the repository and write/link the skill under its active configuration directory (usually located at `C:\Users\DELL\.gemini\config\skills\truecrimescript`). Once loaded, the AI will be able to interpret the storytelling structure, column constraints, and stylistic tones required for the YouTube scripts.

---

## Part 2: Generating and Getting the CSV Script

Now that the AI is equipped with the skill, you can command it to write a research-backed script for any real-world true crime case.

### 1. Trigger the Generation
Use one of the trigger phrases to initiate writing. For example:
* *"Use the `truecrimescript` skill to generate an 83-row script for the John Darwin canoe man disappearance case in CSV format."*
* *"Write a YouTube true crime script CSV for the case of Stephen Port."*

### 2. What the AI Does Behind the Scenes
Following the skill instructions:
* **Factual Research:** The AI searches the web for verified news articles and court records to construct an accurate chronological timeline.
* **Psychological Hooking (Ray William Johnson style):** It structures the narration to hook the viewer instantly in the first 5 rows, inserting strategic re-hooks at lines 15, 20, 40, 60, and 75, ending with a tribute to the victims and an engaging call-to-action (CTA).
* **AI Visual Prompts:** It writes custom, highly detailed image generation prompts containing Flux keywords (`hyper realistic`, `8K ultra detail`, `photorealistic`, `cinematic`) and custom camera motions (`Slow dramatic zoom`, `Slow smooth pan`).
* **Strict Formatting:** The output is structured exactly into four case-insensitive CSV columns:
  `Serial number, image prompt, video prompt, voice over prompt`

### 3. Retrieve the CSV File
Once finished, the AI will:
1. Save the `.csv` file to your local workspace or Downloads directory.
2. Present it to you in the chat interface.
3. Automatically upload it to Google Drive and return the file ID.

Download this generated CSV file to your local computer.

---

## Part 3: Navigating the App to Run & Get Output

With your script CSV ready, you can now compile it into a fully-produced video with AI-generated visuals, voiceovers, background music, and burned subtitles using the GPU pipeline.

### Step 1: Open the Control Center
Navigate to the frontend web application:
* **Production Frontend URL:** [https://public-wine-three-41.vercel.app](https://public-wine-three-41.vercel.app)
* **Direct Backend Endpoint:** [https://airpyk98-truecrime-video-generator.hf.space](https://airpyk98-truecrime-video-generator.hf.space)

### Step 2: Configure & Test Authentication
Before triggering a run, you must tell the app how to connect to Kaggle:
1. In Card 1 (**Kaggle & API Authentication**), enter your Kaggle credentials.
   > **Note:** These credentials can be copied directly from your [tokens.txt](file:///C:/Users/DELL/Documents/antigravity/epic-nobel/kaggle-trigger-app/tokens.txt) file.
2. Input your **Kaggle Username** (e.g., `ikechukwuebiringa1`) and **Kaggle API Key** (e.g., `KGAT_...`).
3. Click the **Test Connection** button to verify the keys are active and can successfully connect to the Kaggle API.
4. Click **Save Authentications** to store them locally in your browser's memory so you don't have to re-enter them.

### Step 3: Upload the CSV Script
1. In Card 2 (**Upload Script CSV**), click the upload zone or drag and drop your downloaded true crime CSV script file.
2. The UI will display the selected file's name and size to confirm it has been successfully loaded.

### Step 4: Configure Video Settings
1. In Card 3 (**Configuration Parameters**), choose your settings:
   * **Aspect Ratio:** Choose `Horizontal (16:9)` for standard YouTube videos or `Vertical / Shorts (9:16)` for YouTube Shorts/TikToks.
   * **Voice Model:** Choose a Kokoro voice (e.g., `am_michael` for energetic narration or `af_heart` for expressive female narration).
   * **Video Speed:** Adjust the range slider (recommended: `1.10x` to `1.20x` for engaging pacing).
   * **Subtitles:** Check `Burn Video Captions` to overlay dynamic, high-visibility captions.
2. *(Optional)* Click **Advanced Caption Options** to customize font size, hex colors, outline strokes, and vertical positioning.

### Step 5: Trigger the Pipeline
1. Click the large green **Generate Video on Kaggle** button.
2. The server will:
   * Package your CSV data.
   * Modify the base notebook parameters dynamically.
   * Push the updated notebook to Kaggle's backend.
   * Spin up a high-performance **Nvidia Tesla T4 GPU** instance.

### Step 6: Monitor Real-Time Logs
* As the pipeline runs, the **Pipeline Execution Monitor** on the right side will display live output logs straight from the Kaggle worker.
* The progress bar will update automatically to reflect the current phase of generation:
  1. **Phase 1 (30%):** Image asset generation (Flux.1 Schnell GPU model).
  2. **Phase 2 (50%):** TTS voice synthesis (Kokoro TTS).
  3. **Phase 3 (70%):** Subtitle generation and Ken Burns zoom animations (FFmpeg).
  4. **Phase 4 (85%):** Audio-video timeline stitching.
  5. **Phase 5 (95%):** Music mixing and final video compilation.

### Step 7: Play and Download the Video
1. Once the progress reaches `100% (Video Render Complete!)`, the **Your Rendered Video** card will appear.
2. **Preview:** You can play the fully rendered MP4 video directly in the browser player to review the final edit.
3. **Download:** Click the **Download Video File (MP4)** button to download the video directly to your local computer.
   > **Note:** The download button fetches the file as a binary blob from the backend space to bypass cross-origin restrictions, downloading it directly to your browser download folder instantly.
4. **Share:** Click **Copy Download Link** to copy the public URL to your clipboard for sharing or remote fetching.
