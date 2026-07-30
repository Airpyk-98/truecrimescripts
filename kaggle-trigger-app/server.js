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

    // Create the data loading cell
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

    // Prepend the cell to the cells array
    notebookData.cells.unshift(dataLoaderCell);

    // Modify User Configuration Cell (typically cell index 2 now, let's find it by token)
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

    // Perform dynamic replacement inside the original USER CONFIGURATION cell to preserve all original functions
    let cellText = notebookData.cells[configCellIndex].source.join("");

    cellText = cellText.replace(/ASPECT_RATIO\s*=\s*['"][^'"]*['"]/, `ASPECT_RATIO   = "${aspect_ratio || '16:9'}"`);
    cellText = cellText.replace(/KOKORO_VOICE\s*=\s*['"][^'"]*['"]/, `KOKORO_VOICE   = "${kokoro_voice || 'am_michael'}"`);
    cellText = cellText.replace(/CAPTION_ENABLED\s*=\s*(True|False)/i, `CAPTION_ENABLED   = ${caption_enabled === 'true' ? 'True' : 'False'}`);
    cellText = cellText.replace(/CAPTION_FONT_SIZE\s*=\s*\d+/, `CAPTION_FONT_SIZE = ${parseInt(caption_font_size) || 22}`);
    cellText = cellText.replace(/CAPTION_COLOR\s*=\s*['"][^'"]*['"]/, `CAPTION_COLOR     = "${caption_color || 'white'}"`);
    cellText = cellText.replace(/CAPTION_OUTLINE\s*=\s*\d+/, `CAPTION_OUTLINE   = ${parseInt(caption_outline) || 4}`);
    cellText = cellText.replace(/CAPTION_Y_POS\s*=\s*[0-9.]+/, `CAPTION_Y_POS     = ${parseFloat(caption_y_pos) || 0.80}`);
    cellText = cellText.replace(/VIDEO_SPEED\s*=\s*[0-9.]+/, `VIDEO_SPEED    = ${parseFloat(video_speed) || 1.1}`);
    cellText = cellText.replace(/HF_TOKEN_OVERRIDE\s*=\s*['"][^'"]*['"]/, `HF_TOKEN_OVERRIDE = "${hf_token_override || ''}"`);
    cellText = cellText.replace(/USE_Z_IMAGE\s*=\s*(True|False)/i, `USE_Z_IMAGE = ${use_z_image === 'true' ? 'True' : 'False'}`);
    cellText = cellText.replace(/Z_IMAGE_KEY\s*=\s*['"][^'"]*['"]/, `Z_IMAGE_KEY = "${z_image_key || ''}"`);
    cellText = cellText.replace(/USE_BGM\s*=\s*(True|False)/i, `USE_BGM = ${use_bgm === 'true' ? 'True' : 'False'}`);
    cellText = cellText.replace(/BGM_VOLUME\s*=\s*[0-9.]+/, `BGM_VOLUME = ${parseFloat(bgm_volume) || 0.12}`);
    cellText = cellText.replace(/CSV_DATA_URL\s*=\s*['"][^'"]*['"]/, `CSV_DATA_URL   = "input_data.csv"`);
    cellText += `\nUPSCALE_MODE = "${upscale_mode || 'none'}"\n`;
    // Dynamic bypass for Pandas storage_options error on local file read
    cellText = cellText.replace(
      'df = pd.read_csv(CSV_DATA_URL, storage_options={"User-Agent": "Mozilla/5.0"})',
      'df = pd.read_csv(CSV_DATA_URL) if not CSV_DATA_URL.startswith("http") else pd.read_csv(CSV_DATA_URL, storage_options={"User-Agent": "Mozilla/5.0"})'
    );

    notebookData.cells[configCellIndex].source = cellText.match(/[^\n]*\n|[^\n]+/g) || [];

    // === DYNAMIC NOTEBOOK INJECTION FOR UPSCALE ===
    for (let i = 0; i < notebookData.cells.length; i++) {
      const c = notebookData.cells[i];
      if (c.cell_type === 'code') {
        let src = c.source.join("");
        
        // 1. Patch run_phase_1_z_image to save urls
        if (src.includes('def run_phase_1_z_image():') && !src.includes('z_image_urls.json')) {
            src = src.replace('    serials = [str(r["Serial number"])', '    z_image_urls = {}\\n    serials = [str(r["Serial number"])');
            src = src.replace('urllib.request.urlretrieve(urls[0], img_path)', 'urllib.request.urlretrieve(urls[0], img_path)\\n                            z_image_urls[sn] = urls[0]');
            src = src.replace('zip_path = os.path.join', 'with open(os.path.join(OUTPUTS_DIR if \\'OUTPUTS_DIR\\' in globals() else OUTPUT_DIR, "z_image_urls.json"), "w") as f:\\n        import json\\n        json.dump(z_image_urls, f)\\n\\n    zip_path = os.path.join');
            c.source = src.split('\\n').map((line, idx, arr) => idx === arr.length - 1 ? line : line + '\\n');
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
           const upLines = upscaleCode.split('\\n').map((line, idx, arr) => idx === arr.length - 1 ? line : line + '\\n');
           const newLines = [];
           for (let line of c.source) {
               if (line.includes('def run_phase_2_audio():')) newLines.push(...upLines);
               newLines.push(line);
           }
           c.source = newLines;
        }

        // 3. Patch execution block
        if (src.includes('run_phase_5_final(stitched)') && !src.includes('run_pipeline_for_images')) {
            const newExec = `if USE_Z_IMAGE:
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
            src = src.replace(/if USE_Z_IMAGE:[\s\S]*run_phase_5_final\(stitched\)/m, newExec);
            c.source = src.split('\n').map((line, idx, arr) => idx === arr.length - 1 ? line : line + '\n');
        }
      }
    }
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
    duration: Math.round((Date.now() - job.startTime) / 1000)
  });
});

// Polling background logic
async function pollJobStatus(jobId) {
  const job = jobs[jobId];
  if (!job) return;

  const kernelSlug = `${job.username}/${job.slug}`;
  const statusCmd = `kaggle kernels status ${kernelSlug}`;
  
  let retryCount = 0;
  const maxRetries = 120; // 120 * 15s = 30 minutes max execution time

  const timer = setInterval(async () => {
    if (job.status === 'complete' || job.status === 'error' || retryCount >= maxRetries) {
      clearInterval(timer);
      if (retryCount >= maxRetries && job.status === 'running') {
        job.status = 'error';
        job.log.push('[ERROR] Job timed out after 30 minutes.');
        cleanupJobTemp(jobId);
      }
      return;
    }

    retryCount++;
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

    const outputsFolder = path.join(downloadDir, 'automated_channel_outputs');
    let videoFiles = [];

    const findAllMp4s = (dir) => {
      let results = [];
      if (!fs.existsSync(dir)) return results;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          results = results.concat(findAllMp4s(fullPath));
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
