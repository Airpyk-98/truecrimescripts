const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 7860;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for CSV uploads (stored temporarily in RAM)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Status cache to track active jobs
const jobs = {};

// Root directories
const BASE_NOTEBOOK_PATH = path.join(__dirname, 'Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4.ipynb');
const OUTPUTS_DIR = path.join(__dirname, 'public', 'outputs');
if (!fs.existsSync(OUTPUTS_DIR)) {
  fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
}

// Helper: Run command asynchronously returning output
function runCmd(command, env = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { env: { ...process.env, ...env } }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message, stderr, stdout });
      } else {
        resolve({ success: true, stdout, stderr });
      }
    });
  });
}

// Check local environment credentials
app.get('/api/check-local-kaggle', async (req, res) => {
  const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\DELL';
  const localKigglePath = path.join(userHome, '.kaggle', 'kaggle.json');
  const geminiKigglePath = path.join(userHome, '.gemini', 'config', 'kaggle', 'kaggle.json');
  
  let exists = false;
  let username = '';
  
  if (fs.existsSync(localKigglePath)) {
    exists = true;
    try {
      const data = JSON.parse(fs.readFileSync(localKigglePath, 'utf8'));
      username = data.username || '';
    } catch (e) {}
  } else if (fs.existsSync(geminiKigglePath)) {
    exists = true;
    try {
      const data = JSON.parse(fs.readFileSync(geminiKigglePath, 'utf8'));
      username = data.username || '';
    } catch (e) {}
  }
  
  res.json({ exists, username });
});

// Configure local credentials if missing
app.post('/api/setup-local-kaggle', (req, res) => {
  const { username, key } = req.body;
  if (!username || !key) {
    return res.status(400).json({ error: 'Username and key are required' });
  }
  
  const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\DELL';
  const targetDir = path.join(userHome, '.kaggle');
  const targetFile = path.join(targetDir, 'kaggle.json');
  
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(targetFile, JSON.stringify({ username, key }, null, 2), 'utf8');
    // Set permissions on Unix systems just in case, on Windows it's fine
    try {
      fs.chmodSync(targetFile, 0o600);
    } catch (e) {}
    res.json({ success: true, message: 'Kaggle credentials saved to ' + targetFile });
  } catch (e) {
    res.status(500).json({ error: 'Failed to write credentials: ' + e.message });
  }
});

// Test Kaggle Credentials Verification
app.post('/api/test-kaggle', async (req, res) => {
  const { kaggle_username, kaggle_key } = req.body;
  
  const finalUsername = (kaggle_username || '').trim();
  const finalKey = (kaggle_key || '').trim();

  if (!finalUsername || !finalKey) {
    return res.status(400).json({ error: 'Kaggle Username and API Key are required to test connection.' });
  }

  const jobId = 'test_' + Date.now();
  const tempDir = path.join(__dirname, 'temp_' + jobId);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Write temporary kaggle.json
    fs.writeFileSync(path.join(tempDir, 'kaggle.json'), JSON.stringify({
      username: finalUsername,
      key: finalKey
    }, null, 2), 'utf8');

    // Support new KGAT token format
    if (finalKey.startsWith('KGAT_')) {
      fs.writeFileSync(path.join(tempDir, 'access_token'), finalKey.trim(), 'utf8');
    }

    const env = {
      KAGGLE_USERNAME: finalUsername,
      KAGGLE_KEY: finalKey,
      KAGGLE_API_TOKEN: finalKey,
      KAGGLE_CONFIG_DIR: tempDir
    };

    // Run a fast, lightweight command to verify credentials
    const testCmd = `kaggle kernels list --mine --page 1 --page-size 1`;
    const result = await runCmd(testCmd, env);

    if (result.success) {
      res.json({ success: true, message: 'Kaggle credentials verified successfully!' });
    } else {
      let errMsg = result.stderr || result.stdout || result.error || 'Unknown error';
      // Strip out private parts of the error if necessary, but keep the core details
      res.status(401).json({ error: `Verification failed: ${errMsg.trim()}` });
    }
  } catch (e) {
    res.status(500).json({ error: 'Server validation error: ' + e.message });
  } finally {
    // Cleanup
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
});


// Proxy for OpenAI-compatible Models
app.post('/api/models', async (req, res) => {
  const { base_url, api_key } = req.body;
  if (!base_url || !api_key) return res.status(400).json({error: 'Base URL and API Key required'});
  try {
    let baseUrl = base_url.trim();
    if (!baseUrl.endsWith('/v1')) {
      if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
      if (!baseUrl.endsWith('/v1') && !baseUrl.includes('v1')) {
          baseUrl = baseUrl + '/v1';
      }
    }
    const url = `${baseUrl}/models`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${api_key}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});


// Trigger Kaggle notebook sequentially for titles
app.post('/api/trigger-titles', upload.none(), async (req, res) => {
  const {
    titles,
    ai_base_url,
    ai_api_key,
    ai_model,
    aspect_ratio,
    tts_engine,
    omnivoice_preset,
    omnivoice_instruct,
    kokoro_voice,
    caption_enabled,
    caption_font_size,
    caption_color,
    caption_outline,
    caption_y_pos,
    video_speed,
    hf_token_override,
    kaggle_username,
    kaggle_key,
    use_z_image,
    z_image_key,
    use_bgm,
    bgm_volume,
    upscale_mode
  } = req.body;

  let titleList = [];
  try {
    titleList = JSON.parse(titles);
  } catch (e) {
    return res.status(400).json({ error: 'Titles must be a valid JSON array.' });
  }
  if (!titleList || titleList.length === 0) {
    return res.status(400).json({ error: 'At least one title is required.' });
  }

  // Determine credentials to use
  let finalUsername = (kaggle_username || '').trim();
  let finalKey = (kaggle_key || '').trim();

  // If no credentials passed, try to load from local file
  if (!finalUsername || !finalKey) {
    const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\DELL';
    const paths = [
      path.join(userHome, '.kaggle', 'kaggle.json'),
      path.join(userHome, '.gemini', 'config', 'kaggle', 'kaggle.json')
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        try {
          const creds = JSON.parse(fs.readFileSync(p, 'utf8'));
          finalUsername = finalUsername || (creds.username || '').trim();
          finalKey = finalKey || (creds.key || '').trim();
        } catch (e) {}
      }
    }
  }

  if (!finalUsername || !finalKey) {
    return res.status(400).json({ error: 'Kaggle Username and API Key are required. Please configure them.' });
  }

  if (!ai_base_url || !ai_api_key || !ai_model) {
    return res.status(400).json({ error: 'AI Generator configuration (Base URL, API Key, Model) is required.' });
  }

  const jobId = 'job_' + Date.now();
  jobs[jobId] = {
    id: jobId,
    status: 'queued',
    username: finalUsername,
    slug: 'youtube-truecrime-flux-zai-kokorotts-t4',
    aspectRatio: aspect_ratio || '16:9',
    log: ['[INFO] Batch job queued. Generating scripts for ' + titleList.length + ' titles...'],
    startTime: Date.now(),
    completedVideos: [],
    titlesTotal: titleList.length,
    titlesDone: 0
  };

  res.json({ jobId, success: true, message: 'Batch run initiated.' });

  // Process sequentially in background
  processBatchInBackground(jobId, titleList, req.body, finalUsername, finalKey);
});

const SYSTEM_PROMPT = `SYSTEM PROMPT: SHORTS CSV SCRIPT & IMAGE PROMPT GENERATOR
You are an expert AI Video Producer and Prompt Engineer specializing in fast-paced YouTube Shorts and TikToks. Your sole task is to take any true crime, mystery, or interesting story title and generate a complete, production-ready script segmented sentence-by-sentence in an exact CSV format.

You must strictly output ONLY the CSV data. Do not include any introductory text, pleasantries, explanations, markdown formatting outside of the CSV, or post-commentary. The response must start immediately with the column headers.

1. CSV STRUCTURE & HEADERS
Your output must be a valid, comma-separated CSV. You must use these exact headers (case-sensitive and spelled exactly as shown):

"Serial number","image prompt","video prompt","voice over prompt"

Every value in every row must be enclosed in double quotes ("). Any double quotes occurring inside the prompts must be escaped as double-double quotes ("") to maintain CSV validity.

2. VOICE OVER PROMPT RULES (THE SCRIPT)
- ONE SINGLE SENTENCE per row.
- Follow a high-retention Ray William Johnson storytelling style: conversational, highly engaging, fast-paced, and punchy.
- Start with a Viral cold-open hook (e.g., "So imagine this...", "This teenager did the absolute unthinkable...").
- Keep sentences short and declarative. Use dramatic "...UNTIL..." transitions.
- Build up suspense and use sarcastic or conversational rhetorical commentary where appropriate.
- The final sentence must be a dramatic punchline, cliffhanger, or an abrupt CTA.

3. IMAGE PROMPT RULES (THE VISUALS)
- For every sentence, generate a hyper-detailed, professional image generation prompt. 
- Use the following exact aesthetic: "Dimensional paper cut-out art, textured craft paper diorama, distinct drop shadows between crisp paper edges, tactile stop-motion aesthetic, cinematic studio lighting, rich colors."
- Describe physical, concrete objects made of paper (e.g., "A crafted paper man standing in front of a green paper bank with miniature paper dollar bills", "A miniature paper city street with paper cars and paper buildings under a night sky").
- Never depict real identifiable people directly. Use symbolic papercraft figures.
- End every image prompt with: "Negative prompt: realistic photography, 3D CGI render, digital drawing, smooth flat vector, blurry, distorted, multi-layered"

4. VIDEO PROMPT RULES (THE MOTION)
The video prompt column must contain exactly one motion keyword. Rotate randomly through these standard motion presets (do not repeat consecutively):
zoom-in
zoom-out
pan-L→R
pan-R→L
tilt-up
tilt-down

5. GENERATION FLOW
- Draft a high-retention, 10–15 sentence script based on the provided title.
- For each sentence, construct the hyper-detailed image prompt and select the ideal video motion preset.
- Output the results strictly in CSV format.
`;

async function generateCsvWithAI(title, ai_base_url, ai_api_key, ai_model) {
  let baseUrl = ai_base_url.trim();
  if (!baseUrl.endsWith('/v1')) {
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    if (!baseUrl.endsWith('/v1') && !baseUrl.includes('v1')) {
        baseUrl = baseUrl + '/v1';
    }
  }
  const url = `${baseUrl}/chat/completions`;
  
  const payload = {
    model: ai_model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `TITLE / CONCEPT: ${title}\n\nPlease generate the CSV script.` }
    ],
    temperature: 0.7
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ai_api_key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`AI API Error (${response.status}): ${txt}`);
  }

  const data = await response.json();
  let content = data.choices[0].message.content;
  // Clean up markdown code blocks if any
  content = content.replace(/^\s*```(csv)?/i, '').replace(/```\s*$/, '').trim();
  return content;
}

// Background batch processing
async function processBatchInBackground(jobId, titles, config, finalUsername, finalKey) {
  const job = jobs[jobId];
  
  for (let i = 0; i < titles.length; i++) {
    const title = titles[i].trim();
    if (!title) continue;
    
    job.status = 'running';
    job.log.push(`[INFO] [Video ${i+1}/${titles.length}] Generating AI script for: ${title}`);
    
    let csvData;
    try {
      csvData = await generateCsvWithAI(title, config.ai_base_url, config.ai_api_key, config.ai_model);
      job.log.push(`[SUCCESS] CSV Script generated for ${title}.`);
    } catch (e) {
      job.log.push(`[ERROR] Failed to generate script for ${title}: ${e.message}`);
      continue; // Skip to next title
    }

    job.log.push(`[INFO] Starting Kaggle pipeline for: ${title}`);
    
    // We run the kaggle logic for this single CSV
    const csvBase64 = Buffer.from(csvData, 'utf-8').toString('base64');
    
    try {
      const outputUrls = await runKagglePipelineSync(job, title, csvBase64, config, finalUsername, finalKey);
      if (outputUrls && outputUrls.length > 0) {
        // Send webhook instantly to n8n
        const absoluteUrls = outputUrls.map(url => `https://epic98-truecrime-video-generator.hf.space${url}`);
        const webhookPayload = {
          title: title,
          download_url: absoluteUrls[0],
          download_urls: absoluteUrls
        };
        
        // 1. Send GET request (which n8n webhook /drivon-yt is specifically registered for)
        try {
          const queryParams = new URLSearchParams({
            title: title,
            download_url: absoluteUrls[0],
            download_urls: JSON.stringify(absoluteUrls)
          }).toString();
          
          await fetch(`https://airpyk98-youtube-n8n.hf.space/webhook/drivon-yt?${queryParams}`, {
            method: 'GET'
          });
          job.log.push(`[SUCCESS] Webhook dispatched to n8n for: ${title}`);
        } catch (we) {
          job.log.push(`[WARN] Webhook GET request error for ${title}: ${we.message}`);
        }

        // 2. Also send POST request as backup
        try {
          await fetch("https://airpyk98-youtube-n8n.hf.space/webhook/drivon-yt", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
          });
        } catch (we) {}

        job.completedVideos.push({
          title: title,
          urls: outputUrls
        });
      }
    } catch (e) {
      job.log.push(`[ERROR] Kaggle pipeline failed for ${title}: ${e.message}`);
    }
    
    job.titlesDone = i + 1;
  }
  
  job.status = 'complete';
  job.log.push(`[SUCCESS] Batch processing complete! ${job.titlesDone}/${titles.length} finished.`);
}

function patchAndPrepareNotebook(notebookData, config, csvBase64) {
  const dataLoaderCell = {
    cell_type: 'code',
    execution_count: null,
    id: 'csv_data_loader',
    metadata: {},
    outputs: [],
    source: [
      "# ── Auto-generated by Web Trigger ───────────────────────────────────────────\n",
      "import base64\n",
      "import os\n",
      `csv_b64 = "${csvBase64}"\n`,
      "csv_data = base64.b64decode(csv_b64).decode('utf-8')\n",
      "with open('input_data.csv', 'w', encoding='utf-8') as f:\n",
      "    f.write(csv_data)\n",
      "print('--> CSV loaded successfully as input_data.csv')\n"
    ]
  };

  notebookData.cells.unshift(dataLoaderCell);

  let configCellIndex = -1;
  for (let i = 0; i < notebookData.cells.length; i++) {
    const cell = notebookData.cells[i];
    if (cell.cell_type === 'code' && cell.source.some(line => line.includes('USER CONFIGURATION'))) {
      configCellIndex = i;
      break;
    }
  }

  if (configCellIndex === -1) {
    throw new Error('Could not find the USER CONFIGURATION cell in the notebook.');
  }

  let cellText = notebookData.cells[configCellIndex].source.join("");
  const safeInstruct = (config.omnivoice_instruct || 'male, deep voice, American accent, storytelling, dramatic, calm').replace(/"""/g, '\\"\\"\\"');
  
  cellText = cellText.replace(/ASPECT_RATIO\s*=\s*['"][^'"]*['"]/, `ASPECT_RATIO   = "${config.aspect_ratio || '16:9'}"`);
  cellText = cellText.replace(/KOKORO_VOICE\s*=\s*['"][^'"]*['"]/, `KOKORO_VOICE   = "${config.kokoro_voice || 'am_michael'}"\nTTS_ENGINE     = "${config.tts_engine || 'omnivoice'}"\nOMNIVOICE_INSTRUCT = """${safeInstruct}"""`);
  cellText = cellText.replace(/CAPTION_ENABLED\s*=\s*(True|False)/i, `CAPTION_ENABLED   = ${config.caption_enabled === 'true' ? 'True' : 'False'}`);
  cellText = cellText.replace(/CAPTION_FONT_SIZE\s*=\s*\d+/, `CAPTION_FONT_SIZE = ${parseInt(config.caption_font_size) || 22}`);
  cellText = cellText.replace(/CAPTION_COLOR\s*=\s*['"][^'"]*['"]/, `CAPTION_COLOR     = "${config.caption_color || 'white'}"`);
  cellText = cellText.replace(/CAPTION_OUTLINE\s*=\s*\d+/, `CAPTION_OUTLINE   = ${parseInt(config.caption_outline) || 4}`);
  cellText = cellText.replace(/CAPTION_Y_POS\s*=\s*[0-9.]+/, `CAPTION_Y_POS     = ${parseFloat(config.caption_y_pos) || 0.80}`);
  cellText = cellText.replace(/VIDEO_SPEED\s*=\s*[0-9.]+/, `VIDEO_SPEED    = ${parseFloat(config.video_speed) || 1.1}`);
  cellText = cellText.replace(/HF_TOKEN_OVERRIDE\s*=\s*['"][^'"]*['"]/, `HF_TOKEN_OVERRIDE = "${config.hf_token_override || ''}"`);
  cellText = cellText.replace(/USE_Z_IMAGE\s*=\s*(True|False)/i, `USE_Z_IMAGE = ${config.use_z_image === 'true' ? 'True' : 'False'}`);
  cellText = cellText.replace(/Z_IMAGE_KEY\s*=\s*['"][^'"]*['"]/, `Z_IMAGE_KEY = "${config.z_image_key || ''}"`);
  cellText = cellText.replace(/USE_BGM\s*=\s*(True|False)/i, `USE_BGM = ${config.use_bgm === 'true' ? 'True' : 'False'}`);
  cellText = cellText.replace(/BGM_VOLUME\s*=\s*[0-9.]+/, `BGM_VOLUME = ${parseFloat(config.bgm_volume) || 0.12}`);
  cellText = cellText.replace(/CSV_DATA_URL\s*=\s*['"][^'"]*['"]/, `CSV_DATA_URL   = "input_data.csv"\nUPSCALE_MODE = "${config.upscale_mode || 'none'}"`);
  cellText = cellText.replace(
    'df = pd.read_csv(CSV_DATA_URL, storage_options={"User-Agent": "Mozilla/5.0"})',
    'df = pd.read_csv(CSV_DATA_URL) if not CSV_DATA_URL.startswith("http") else pd.read_csv(CSV_DATA_URL, storage_options={"User-Agent": "Mozilla/5.0"})'
  );

  notebookData.cells[configCellIndex].source = cellText.match(/[^\n]*\n|[^\n]+/g) || [];

  // Patch notebook cells
  for (let i = 0; i < notebookData.cells.length; i++) {
    const c = notebookData.cells[i];
    if (c.cell_type === 'code') {
      let src = c.source.join("");
      
      // 1. Patch run_phase_1_z_image to save urls
      if (src.includes('def run_phase_1_z_image():') && !src.includes('z_image_urls.json')) {
          src = src.replace('    serials = [str(r["Serial number"])', '    z_image_urls = {}\n    serials = [str(r["Serial number"])');
          src = src.replace('urllib.request.urlretrieve(urls[0], img_path)', 'urllib.request.urlretrieve(urls[0], img_path)\n                            z_image_urls[sn] = urls[0]');
          src = src.replace('zip_path = os.path.join', 'with open(os.path.join(OUTPUTS_DIR if "OUTPUTS_DIR" in globals() else OUTPUT_DIR, "z_image_urls.json"), "w") as f:\n        import json\n        json.dump(z_image_urls, f)\n\n    zip_path = os.path.join');
          c.source = src.split('\n').map((line, idx, arr) => idx === arr.length - 1 ? line : line + '\n');
      }
      
      // 2. Inject run_phase_1c_upscale before phase 2
      if (src.includes('def run_phase_2_audio():') && !src.includes('def run_phase_1c_upscale():')) {
         const upscaleCode = `
# ============================================================
# PHASE 1C — Upscale Images
# ============================================================
def run_phase_1c_upscale():
    import requests, time, urllib.request, json
    print("\\n" + "="*60)
    print("PHASE 1C: Upscale Images (kie.ai)")
    print("="*60)
    
    upscaled_dir = os.path.join(OUTPUTS_DIR if 'OUTPUTS_DIR' in globals() else OUTPUT_DIR, "automated_channel_outputs", "images_upscaled")
    os.makedirs(upscaled_dir, exist_ok=True)
    
    global IMAGES_DIR_UPSCALED
    IMAGES_DIR_UPSCALED = upscaled_dir
    
    if UPSCALE_MODE == "none":
        print("--> Upscaling disabled. Skipping.")
        return
        
    z_image_key = globals().get("Z_IMAGE_KEY", "").strip()
    if not z_image_key:
        print("--> Error: Z_IMAGE_KEY is missing but upscale mode is active. Skipping.")
        return
        
    headers = {
        "Authorization": f"Bearer {z_image_key}",
        "Content-Type": "application/json"
    }
    
    z_image_urls = {}
    urls_file = os.path.join(OUTPUTS_DIR if 'OUTPUTS_DIR' in globals() else OUTPUT_DIR, "z_image_urls.json")
    if os.path.exists(urls_file):
        try:
            with open(urls_file, "r") as f:
                z_image_urls = json.load(f)
        except:
            pass

    for idx, row in tqdm(df.iterrows(), total=len(df), desc="Upscaling Images"):
        sn = str(row["Serial number"])
        orig_img_path = os.path.join(IMAGES_DIR, f"{sn}.png")
        up_img_path = os.path.join(upscaled_dir, f"{sn}.png")
        
        if os.path.exists(up_img_path):
            continue
            
        public_url = z_image_urls.get(sn)
        
        if not public_url:
            if not os.path.exists(orig_img_path):
                print(f"  [ERROR] Missing original image for {sn}.")
                continue
            try:
                print(f"  Uploading {sn}.png to catbox.moe...")
                with open(orig_img_path, 'rb') as f:
                    up_resp = requests.post("https://catbox.moe/user/api.php", data={"reqtype": "fileupload"}, files={"fileToUpload": f})
                up_resp.raise_for_status()
                public_url = up_resp.text.strip()
            except Exception as e:
                print(f"  [ERROR] Catbox upload failed for {sn}: {e}")
                continue
                
        create_payload = {
            "model": "recraft/crisp-upscale",
            "input": {
                "image_url": public_url
            }
        }
        
        task_id = None
        for attempt in range(3):
            try:
                resp = requests.post("https://api.kie.ai/api/v1/jobs/createTask", json=create_payload, headers=headers)
                data = resp.json()
                if data.get("code") == 200:
                    task_id = data.get("data", {}).get("taskId")
                    break
            except Exception as e:
                pass
            time.sleep(3)
            
        if not task_id:
            print(f"  [ERROR] Failed to start upscale task for {sn}.")
            continue
            
        success = False
        for _ in range(60):
            time.sleep(5)
            try:
                poll_resp = requests.get(f"https://api.kie.ai/api/v1/jobs/recordInfo?taskId={task_id}", headers=headers)
                poll_data = poll_resp.json()
                if poll_data.get("code") == 200:
                    state = poll_data.get("data", {}).get("state")
                    if state == "success":
                        res_json = json.loads(poll_data.get("data", {}).get("resultJson", "{}"))
                        urls = res_json.get("resultUrls", [])
                        if urls:
                            urllib.request.urlretrieve(urls[0], up_img_path)
                            print(f"  Saved upscaled {sn}.png")
                            success = True
                        break
                    elif state == "fail":
                        print(f"  [ERROR] Upscale failed for {sn}: {poll_data.get('data', {}).get('failMsg')}")
                        break
            except Exception as e:
                pass
                
        if not success:
            print(f"  [ERROR] Could not fetch upscaled image for {sn}.")
            
    print("--> Phase 1C Upscale complete.")
`;
         const upLines = upscaleCode.split('\n').map((line, idx, arr) => idx === arr.length - 1 ? line : line + '\n');
         const newLines = [];
         for (let line of c.source) {
             if (line.includes('def run_phase_2_audio():')) newLines.push(...upLines);
             newLines.push(line);
         }
         c.source = newLines;
      }

      // 3. Patch execution block & inject OmniVoice + Whisper Phase 2
      let srcStr = c.source.join("");
      if (srcStr.includes('run_phase_5_final(stitched)') && !srcStr.includes('run_pipeline_for_images')) {
          const newExec = `
def run_phase_2_audio():
    import os, sys, time, subprocess
    import numpy as np
    import soundfile as sf
    import pandas as pd
    
    tts_engine = str(globals().get("TTS_ENGINE", "omnivoice")).lower()
    omni_instruct = str(globals().get("OMNIVOICE_INSTRUCT", "male, deep voice, American accent, storytelling, dramatic, calm"))
    kokoro_voice = str(globals().get("KOKORO_VOICE", "am_michael"))
    
    print("\\n" + "="*60)
    print(f"PHASE 2: Voice Synthesis & Whisper Alignment")
    print(f"         Engine: {tts_engine} | Voice/Instruct: {omni_instruct if tts_engine == 'omnivoice' else kokoro_voice}")
    print("="*60)
    
    serials = [str(r["Serial number"]) for _, r in df.iterrows()]
    if all_outputs_exist(AUDIO_DIR, serials, ".wav"):
        print("--> All audio already on disk. Reading durations...")
        for idx, row in df.iterrows():
            sn = str(row["Serial number"])
            ap = os.path.join(AUDIO_DIR, f"{sn}.wav")
            if os.path.exists(ap):
                data, sr = sf.read(ap)
                df.at[idx, "audio_length"] = round(len(data) / sr, 3)
        df.to_csv(os.path.join(OUTPUT_DIR, "updated_manifest.csv"), index=False)
        return
        
    print("--> Installing omnivoice and whisper-timestamped...")
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "omnivoice", "whisper-timestamped", "openai-whisper"], check=False)
    
    full_text = " ".join(df["voice over prompt"].astype(str).tolist())
    print(f"--> Script concatenated: {len(full_text)} characters across {len(df)} sentences.")
    
    sample_rate = 24000
    final_audio_array = None
    
    def sanitize_omni_instruct(raw_str):
        import re
        valid_items = [
            "american accent", "australian accent", "british accent", "canadian accent",
            "child", "chinese accent", "elderly", "female", "high pitch", "indian accent",
            "japanese accent", "korean accent", "low pitch", "male", "middle-aged",
            "moderate pitch", "portuguese accent", "russian accent", "teenager",
            "very high pitch", "very low pitch", "whisper", "young adult"
        ]
        synonyms = {
            "deep": "low pitch", "deep voice": "low pitch", "baritone": "low pitch", "bass": "very low pitch",
            "high": "high pitch", "young": "young adult", "boy": "male, young adult", "girl": "female, young adult",
            "man": "male", "woman": "female", "british": "british accent", "american": "american accent",
            "australian": "australian accent", "canadian": "canadian accent", "indian": "indian accent",
            "russian": "russian accent", "old": "elderly", "authoritative": "middle-aged, low pitch",
            "cinematic documentary": "low pitch", "storytelling": "moderate pitch", "dramatic": "low pitch"
        }
        s = str(raw_str).lower()
        for k, v in synonyms.items():
            s = re.sub(r'\\b' + re.escape(k) + r'\\b', v, s)
        found = []
        for chunk in s.split(","):
            c = chunk.strip()
            if c in valid_items and c not in found:
                found.append(c)
        if not found:
            for vi in valid_items:
                if vi in s and vi not in found:
                    found.append(vi)
        if not found:
            found = ["male", "young adult", "american accent", "low pitch"]
        return ", ".join(found)

    if tts_engine == "omnivoice":
        cleaned_instruct = sanitize_omni_instruct(omni_instruct)
        print(f"--> Generating single continuous audio with OmniVoice...")
        print(f"    Raw Instruct: '{omni_instruct}' -> Sanitized Valid Tags: '{cleaned_instruct}'")
        try:
            from omnivoice import OmniVoice
            import torch
            model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cuda", dtype=torch.float16)
            final_audio_array = model.generate(
                text=full_text,
                instruct=cleaned_instruct,
                num_step=16
            )
            print("--> OmniVoice synthesis successful!")
        except Exception as e:
            print(f"--> OmniVoice error: {e}. Falling back to Kokoro full-text generation.")
            tts_engine = "kokoro"

    if final_audio_array is None or tts_engine == "kokoro":
        print(f"--> Generating single continuous audio with Kokoro (Voice: {kokoro_voice})...")
        from kokoro import KPipeline
        tts = KPipeline(lang_code="a")
        chunks = []
        for _, _, audio_chunk in tts(full_text, voice=kokoro_voice):
            if audio_chunk is not None and len(audio_chunk) > 0:
                chunks.append(audio_chunk)
        final_audio_array = np.concatenate(chunks).astype(np.float32)
        print("--> Kokoro synthesis successful!")
        
    if hasattr(final_audio_array, "cpu"):
        final_audio_array = final_audio_array.cpu().float().numpy()
    final_audio_array = np.squeeze(final_audio_array)
    
    final_audio_path = os.path.join(OUTPUT_DIR, "final_audio.wav")
    sf.write(final_audio_path, final_audio_array, sample_rate)
    print(f"--> Saved master audio track: {final_audio_path} ({len(final_audio_array)/sample_rate:.2f}s)")
    
    print("--> Transcribing audio with Whisper for millisecond word-level timestamps...")
    import whisper_timestamped as whisper
    import torch
    whisper_device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"--> Running Whisper on device: {whisper_device}")
    w_model = whisper.load_model("base", device=whisper_device)
    w_audio = whisper.load_audio(final_audio_path)
    result = whisper.transcribe(w_model, w_audio, language="en")
    
    words = []
    for s in result.get("segments", []):
        for w in s.get("words", []):
            words.append(w)
            
    print(f"--> Whisper transcribed {len(words)} total words across {len(df)} rows.")
    
    total_words = len(words)
    total_audio_sec = len(final_audio_array) / sample_rate
    
    # 1. Map CSV rows to Whisper word indices
    row_boundaries = []
    current_cursor = 0
    for idx, row in df.iterrows():
        sentence = str(row["voice over prompt"])
        sentence_words = len(sentence.split())
        
        if current_cursor < total_words:
            first_w_idx = current_cursor
            last_w_idx = min(current_cursor + sentence_words - 1, total_words - 1)
            row_boundaries.append((first_w_idx, last_w_idx))
            current_cursor = last_w_idx + 1
        else:
            row_boundaries.append((None, None))
            
    # 2. Compute contiguous non-overlapping split points at the midpoint of inter-sentence silences
    split_points = [0.0]
    for i in range(len(row_boundaries) - 1):
        curr_last = row_boundaries[i][1]
        next_first = row_boundaries[i+1][0]
        
        if curr_last is not None and next_first is not None:
            curr_end_time = words[curr_last]["end"]
            next_start_time = words[next_first]["start"]
            
            if next_start_time >= curr_end_time:
                mid = (curr_end_time + next_start_time) / 2.0
            else:
                mid = curr_end_time
            split_points.append(mid)
        else:
            last_point = split_points[-1]
            split_points.append(last_point + 2.0)
            
    split_points.append(total_audio_sec)
    
    # 3. Slice the master audio without any gaps or discarded audio
    for idx, row in df.iterrows():
        sn = str(row["Serial number"])
        start_time = split_points[idx]
        end_time = split_points[idx + 1]
        
        duration = max(end_time - start_time, 0.5)
        
        start_sample = int(start_time * sample_rate)
        end_sample = min(int(end_time * sample_rate), len(final_audio_array))
        clip_array = final_audio_array[start_sample:end_sample]
        
        audio_path = os.path.join(AUDIO_DIR, f"{sn}.wav")
        sf.write(audio_path, clip_array, sample_rate)
        
        df.at[idx, "audio_length"] = round(duration, 3)
        print(f"  Row {sn}: [{start_time:.2f}s -> {end_time:.2f}s] ({duration:.2f}s) -> {audio_path}")
            
    df.to_csv(os.path.join(OUTPUT_DIR, "updated_manifest.csv"), index=False)
    print("--> Phase 2 complete. Continuous master audio sliced at natural silence midpoints with 100% audio preserved.")

if USE_Z_IMAGE:
    run_phase_1_z_image()
else:
    run_phase_1_flux()

if UPSCALE_MODE in ["upscaled_only", "both"]:
    run_phase_1c_upscale()

run_phase_2_audio()

def run_pipeline_for_images(img_dir_path, suffix_name):
    global IMAGES_DIR
    orig_images = IMAGES_DIR
    IMAGES_DIR = img_dir_path
    
    run_phase_3_effects()
    stitched_vids = run_phase_4_stitch()
    
    final_out = os.path.join(OUTPUT_DIR, f"FINAL_AUTOMATED_OUTPUT_{ASPECT_RATIO.replace(':','_')}_{suffix_name}.mp4")
    default_out = os.path.join(OUTPUT_DIR, f"FINAL_AUTOMATED_OUTPUT_{ASPECT_RATIO.replace(':','_')}.mp4")
    
    run_phase_5_final(stitched_vids)
    
    if os.path.exists(default_out):
        os.rename(default_out, final_out)
        print(f"--> Saved {suffix_name} video to: {final_out}")
        
    IMAGES_DIR = orig_images

if UPSCALE_MODE == "both":
    print("\\n--> Running pipeline for NORMAL images...")
    run_pipeline_for_images(IMAGES_DIR, "normal")
    print("\\n--> Running pipeline for UPSCALED images...")
    run_pipeline_for_images(IMAGES_DIR_UPSCALED, "upscaled")
elif UPSCALE_MODE == "upscaled_only":
    print("\\n--> Running pipeline for UPSCALED images...")
    run_pipeline_for_images(IMAGES_DIR_UPSCALED, "upscaled")
else:
    print("\\n--> Running pipeline for NORMAL images...")
    run_pipeline_for_images(IMAGES_DIR, "normal")`;
          const startIndex = c.source.findIndex(line => line.includes('if USE_Z_IMAGE:'));
          const endIndex = c.source.findIndex(line => line.includes('run_phase_5_final(stitched)'));
          if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
              const execLines = newExec.split('\n').map((line, idx, arr) => idx === arr.length - 1 ? line : line + '\n');
              c.source.splice(startIndex, endIndex - startIndex + 1, ...execLines);
          }
      }
    }
  }
}

// Re-usable synchronous Kaggle trigger
async function runKagglePipelineSync(job, title, csvBase64, config, finalUsername, finalKey) {
  const tempDir = path.join(__dirname, 'temp_' + job.id + '_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  // Sanitize title for filename
  const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);

  // Write credentials
  fs.writeFileSync(path.join(tempDir, 'kaggle.json'), JSON.stringify({ username: finalUsername, key: finalKey }, null, 2), 'utf8');
  if (finalKey.startsWith('KGAT_')) {
    fs.writeFileSync(path.join(tempDir, 'access_token'), finalKey.trim(), 'utf8');
  }

  const env = {
    KAGGLE_USERNAME: finalUsername,
    KAGGLE_KEY: finalKey,
    KAGGLE_API_TOKEN: finalKey,
    KAGGLE_CONFIG_DIR: tempDir
  };

  // Modify notebook
  let notebookData;
  let notebookPath = BASE_NOTEBOOK_PATH;
  if (!fs.existsSync(notebookPath)) {
    notebookPath = path.join(__dirname, 'Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4.ipynb');
  }
  const notebookRaw = fs.readFileSync(notebookPath, 'utf8');
  notebookData = JSON.parse(notebookRaw);

  patchAndPrepareNotebook(notebookData, config, csvBase64);

  // Write modified notebook
  const notebookFilename = 'Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4.ipynb';
  fs.writeFileSync(path.join(tempDir, notebookFilename), JSON.stringify(notebookData, null, 2), 'utf8');

  // Slug logic
  const kernelSlug = `${finalUsername.toLowerCase()}/youtube-truecrime-flux-zai-kokorotts-t4`;

  const metadata = {
    id: kernelSlug,
    title: 'Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4',
    code_file: notebookFilename,
    language: 'python',
    kernel_type: 'notebook',
    is_private: true,
    enable_gpu: true,
    accelerator: 'NvidiaTeslaT4',
    enable_internet: true,
    dataset_sources: [],
    competition_sources: [],
    kernel_sources: []
  };
  fs.writeFileSync(path.join(tempDir, 'kernel-metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');

  const pushCmd = `kaggle kernels push -p "${tempDir}" --accelerator NvidiaTeslaT4`;
  const pushResult = await runCmd(pushCmd, env);
  if (!pushResult.success) {
    throw new Error(`Kaggle CLI push failed: ${pushResult.error}`);
  }
  job.log.push(`[INFO] Kernel pushed for ${safeTitle}. Waiting for Kaggle...`);

  // Wait for Kaggle to finish
  const statusCmd = `kaggle kernels status ${kernelSlug}`;
  
  await new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      const res = await runCmd(statusCmd, env);
      if (res.success) {
        const output = res.stdout.trim().toLowerCase();
        job.log.push(`[POLL ${safeTitle}] ${output}`);
        if (output.includes('complete') || output.includes('error') || output.includes('cancel')) {
          clearInterval(timer);
          if (output.includes('complete')) {
            resolve();
          } else {
            reject(new Error(`Kaggle ended with status: ${output}`));
          }
        }
      } else {
         job.log.push(`[WARN] Polling failed: ${res.error}`);
      }
    }, 15000);
  });

  // Download outputs
  const downloadDir = path.join(tempDir, 'output');
  fs.mkdirSync(downloadDir, { recursive: true });
  const dlCmd = `kaggle kernels output ${kernelSlug} -p "${downloadDir}"`;
  const dlRes = await runCmd(dlCmd, env);
  if (!dlRes.success) {
    throw new Error(`Failed to download output: ${dlRes.error}`);
  }

  // Find MP4s
  const findAllMp4s = (dir) => {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        if (file !== 'effect_videos' && file !== 'stitched') {
          results = results.concat(findAllMp4s(fullPath));
        }
      } else if (file.endsWith('.mp4')) {
        results.push(fullPath);
      }
    }
    return results;
  };

  let videoFiles = [];
  const outputsFolder = path.join(downloadDir, 'automated_channel_outputs');
  if (fs.existsSync(outputsFolder)) {
    const allMp4s = fs.readdirSync(outputsFolder).filter(f => f.endsWith('.mp4'));
    const finalMp4s = allMp4s.filter(f => f.startsWith('FINAL_AUTOMATED_OUTPUT_'));
    if (finalMp4s.length > 0) {
      videoFiles = finalMp4s.map(f => path.join(outputsFolder, f));
    } else {
      videoFiles = allMp4s.filter(f => !f.includes('_clip') && !f.includes('effect') && !f.startsWith('temp_')).map(f => path.join(outputsFolder, f));
    }
  }
  if (videoFiles.length === 0) {
    videoFiles = findAllMp4s(downloadDir).filter(f => {
      const b = path.basename(f);
      return !b.includes('_clip') && !b.includes('effect') && !b.startsWith('temp_');
    });
  }

  if (videoFiles.length === 0) {
    throw new Error('No MP4 output files found.');
  }

  const urls = [];
  videoFiles.forEach((vFile) => {
    const isUpscaled = vFile.includes('upscaled');
    const destFilename = `${safeTitle}_${isUpscaled ? 'upscaled' : 'normal'}.mp4`;
    const destPath = path.join(OUTPUTS_DIR, destFilename);
    fs.copyFileSync(vFile, destPath);
    urls.push(`/outputs/${destFilename}`); 
  });
  
  // Cleanup temp
  fs.rmSync(tempDir, { recursive: true, force: true });
  
  return urls;
}

// Trigger a Kaggle notebook run
app.post('/api/trigger', upload.single('csvFile'), async (req, res) => {
  const {
    aspect_ratio,
    kokoro_voice,
    caption_enabled,
    caption_font_size,
    caption_color,
    caption_outline,
    caption_y_pos,
    video_speed,
    hf_token_override,
    kaggle_username,
    kaggle_key,
    use_z_image,
    z_image_key,
    use_bgm,
    bgm_volume,
    upscale_mode
  } = req.body;

  // Validate uploaded file
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required.' });
  }

  // Determine credentials to use
  let finalUsername = (kaggle_username || '').trim();
  let finalKey = (kaggle_key || '').trim();

  // If no credentials passed, try to load from local file
  if (!finalUsername || !finalKey) {
    const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\DELL';
    const paths = [
      path.join(userHome, '.kaggle', 'kaggle.json'),
      path.join(userHome, '.gemini', 'config', 'kaggle', 'kaggle.json')
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        try {
          const creds = JSON.parse(fs.readFileSync(p, 'utf8'));
          finalUsername = finalUsername || (creds.username || '').trim();
          finalKey = finalKey || (creds.key || '').trim();
        } catch (e) {}
      }
    }
  }

  if (!finalUsername || !finalKey) {
    return res.status(400).json({ error: 'Kaggle Username and API Key are required. Please configure them.' });
  }

  // Create temporary directory for the push
  const jobId = 'job_' + Date.now();
  const tempDir = path.join(__dirname, 'temp_' + jobId);
  fs.mkdirSync(tempDir, { recursive: true });

  // Ensure credentials are written to the job-specific temp directory
  try {
    fs.writeFileSync(path.join(tempDir, 'kaggle.json'), JSON.stringify({
      username: finalUsername,
      key: finalKey
    }, null, 2), 'utf8');
    
    // Support new KGAT token format
    if (finalKey.startsWith('KGAT_')) {
      fs.writeFileSync(path.join(tempDir, 'access_token'), finalKey.trim(), 'utf8');
    }
    
    try {
      fs.chmodSync(path.join(tempDir, 'kaggle.json'), 0o600);
      if (finalKey.startsWith('KGAT_')) {
        fs.chmodSync(path.join(tempDir, 'access_token'), 0o600);
      }
    } catch (e) {
      // Ignore permission/chmod error on Windows/some environments
    }
  } catch (err) {
    console.error('Failed to write temporary kaggle.json on server:', err);
  }

  const env = {
    KAGGLE_USERNAME: finalUsername,
    KAGGLE_KEY: finalKey,
    KAGGLE_API_TOKEN: finalKey,
    KAGGLE_CONFIG_DIR: tempDir
  };

  try {
    // Read the downloaded base notebook
    let notebookData;
    let notebookPath = BASE_NOTEBOOK_PATH;

    if (!fs.existsSync(notebookPath)) {
      // Look in the local folder as fallback
      notebookPath = path.join(__dirname, 'Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4.ipynb');
      if (!fs.existsSync(notebookPath)) {
        // Look in downloads directory
        const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\DELL';
        notebookPath = path.join(userHome, 'Downloads', 'kokoro-tts-automation (3).ipynb');
      }
    }

    if (!fs.existsSync(notebookPath)) {
      throw new Error(`Base notebook not found. Looked at: ${BASE_NOTEBOOK_PATH} and fallback locations.`);
    }

    const notebookRaw = fs.readFileSync(notebookPath, 'utf8');
    notebookData = JSON.parse(notebookRaw);

    // Prepare CSV data in base64
    const csvBase64 = req.file.buffer.toString('base64');
    patchAndPrepareNotebook(notebookData, req.body, csvBase64);
    // ===============================================

    // Write modified notebook
    const notebookFilename = 'Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4.ipynb';
    fs.writeFileSync(
      path.join(tempDir, notebookFilename),
      JSON.stringify(notebookData, null, 2),
      'utf8'
    );

    // Create kernel-metadata.json
    const metadata = {
      id: `${finalUsername.toLowerCase()}/youtube-truecrime-flux-zai-kokorotts-t4`,
      title: 'Youtube-Truecrime-FLUX-Zai-KokoroTTS-T4',
      code_file: notebookFilename,
      language: 'python',
      kernel_type: 'notebook',
      is_private: true,
      enable_gpu: true,
      accelerator: 'NvidiaTeslaT4',
      enable_internet: true,
      dataset_sources: [],
      competition_sources: [],
      kernel_sources: []
    };

    fs.writeFileSync(
      path.join(tempDir, 'kernel-metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf8'
    );

    // Push the notebook to Kaggle using the CLI
    const pushCmd = `kaggle kernels push -p "${tempDir}" --accelerator NvidiaTeslaT4`;
    const pushResult = await runCmd(pushCmd, env);

    if (!pushResult.success) {
      throw new Error(`Kaggle CLI push failed: ${pushResult.error}\nStdout: ${pushResult.stdout}\nStderr: ${pushResult.stderr}`);
    }

    // Set initial job state
    jobs[jobId] = {
      id: jobId,
      status: 'queued',
      username: finalUsername,
      slug: 'youtube-truecrime-flux-zai-kokorotts-t4',
      aspectRatio: aspect_ratio || '16:9',
      tempDir: tempDir,
      env: env,
      log: ['Kernel pushed successfully. Triggering Kaggle run...', pushResult.stdout],
      startTime: Date.now()
    };

    // Start background status polling
    pollJobStatus(jobId);

    res.json({ jobId, success: true, message: 'Notebook pushed successfully. Run initiated.' });
  } catch (error) {
    // Clean up directory on immediate failure
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
    res.status(500).json({ error: error.message });
  }
});

// Get job status
app.get('/api/status/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }
  res.json({
    id: job.id,
    status: job.status,
    log: job.log,
    aspectRatio: job.aspectRatio,
    videoUrl: job.videoUrl || null,
    videoUrls: job.videoUrls || [],
    completedVideos: job.completedVideos || [],
    titlesTotal: job.titlesTotal || 0,
    titlesDone: job.titlesDone || 0,
    duration: Math.round((Date.now() - job.startTime) / 1000)
  });
});

// Polling background logic
async function pollJobStatus(jobId) {
  const job = jobs[jobId];
  if (!job) return;

  const kernelSlug = `${job.username}/${job.slug}`;
  const statusCmd = `kaggle kernels status ${kernelSlug}`;

  const timer = setInterval(async () => {
    if (job.status === 'complete' || job.status === 'error') {
      clearInterval(timer);
      return;
    }

    const res = await runCmd(statusCmd, job.env);

    if (res.success) {
      const output = res.stdout.trim();
      job.log.push(output);

      // Parse status: match keywords case-insensitively to support "KernelWorkerStatus.XXXX"
      const lowerOutput = output.toLowerCase();
      if (lowerOutput.includes('running')) {
        job.status = 'running';
      } else if (lowerOutput.includes('complete')) {
        job.status = 'downloading';
        job.log.push('[INFO] Kaggle run complete! Fetching video outputs...');
        clearInterval(timer);
        downloadOutputs(jobId);
      } else if (lowerOutput.includes('error')) {
        job.status = 'error';
        job.log.push('[ERROR] Kaggle run failed with error status.');
        cleanupJobTemp(jobId);
      } else if (lowerOutput.includes('cancel')) {
        job.status = 'error';
        job.log.push('[ERROR] Kaggle run was cancelled.');
        clearInterval(timer);
        cleanupJobTemp(jobId);
      } else if (lowerOutput.includes('queued')) {
        job.status = 'queued';
      }
    } else {
      job.log.push(`[WARN] Polling failed: ${res.error}`);
    }
  }, 15000); // Poll every 15 seconds
}

// Download final outputs once execution is complete
async function downloadOutputs(jobId) {
  const job = jobs[jobId];
  if (!job) return;

  const kernelSlug = `${job.username}/${job.slug}`;
  const downloadDir = path.join(job.tempDir, 'output');
  fs.mkdirSync(downloadDir, { recursive: true });

  const dlCmd = `kaggle kernels output ${kernelSlug} -p "${downloadDir}"`;
  job.log.push('[INFO] Running output download command...');
  
  const res = await runCmd(dlCmd, job.env);
  if (!res.success) {
    job.status = 'error';
    job.log.push(`[ERROR] Failed to download output: ${res.error}`);
    cleanupJobTemp(jobId);
    return;
  }

  try {
    const outputsFolder = path.join(downloadDir, 'automated_channel_outputs');
    let videoFiles = [];

    const findAllMp4s = (dir) => {
      let results = [];
      if (!fs.existsSync(dir)) return results;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          if (file !== 'effect_videos' && file !== 'stitched') {
            results = results.concat(findAllMp4s(fullPath));
          }
        } else if (file.endsWith('.mp4')) {
          results.push(fullPath);
        }
      }
      return results;
    };

    if (fs.existsSync(outputsFolder)) {
      videoFiles = fs.readdirSync(outputsFolder)
        .filter(f => f.endsWith('.mp4'))
        .map(f => path.join(outputsFolder, f));
    }
    
    if (videoFiles.length === 0) {
      videoFiles = findAllMp4s(downloadDir);
    }

    if (videoFiles.length > 0) {
      const urls = [];
      videoFiles.forEach((vFile, idx) => {
        // preserve the filename logic from the notebook (e.g. final_video_upscaled.mp4 vs final_video_normal.mp4)
        // or just append _upscaled based on original name
        const isUpscaled = vFile.includes('upscaled');
        const destFilename = `video_${jobId}_${isUpscaled ? 'upscaled' : 'normal'}_${idx}.mp4`;
        const destPath = path.join(OUTPUTS_DIR, destFilename);
        fs.copyFileSync(vFile, destPath);
        urls.push(`/outputs/${destFilename}`);
      });
      
      job.status = 'complete';
      job.videoUrls = urls;
      job.log.push(`[SUCCESS] ${urls.length} Video(s) downloaded and served successfully!`);
    } else {
      throw new Error('No MP4 output files found in downloaded assets.');
    }
  } catch (e) {
    job.status = 'error';
    job.log.push(`[ERROR] Processing video output failed: ${e.message}`);
  }

  cleanupJobTemp(jobId);
}

// Cleanup local temp directories
function cleanupJobTemp(jobId) {
  const job = jobs[jobId];
  if (!job) return;
  
  setTimeout(() => {
    try {
      if (fs.existsSync(job.tempDir)) {
        fs.rmSync(job.tempDir, { recursive: true, force: true });
        console.log(`[INFO] Cleaned up temp dir for job ${jobId}`);
      }
    } catch (e) {
      console.error(`[WARN] Failed to delete temp dir: ${e.message}`);
    }
  }, 10000); // 10s grace period
}

// Start Server
app.listen(PORT, () => {
  console.log(`==========================================`);
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log(`==========================================`);
});
