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
const BASE_NOTEBOOK_PATH = 'C:\\Users\\DELL\\Downloads\\kokoro-tts-automation (3).ipynb';
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
    kaggle_key
  } = req.body;

  // Validate uploaded file
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required.' });
  }

  // Determine credentials to use
  let finalUsername = kaggle_username;
  let finalKey = kaggle_key;

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
          finalUsername = finalUsername || creds.username;
          finalKey = finalKey || creds.key;
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
    try {
      fs.chmodSync(path.join(tempDir, 'kaggle.json'), 0o600);
    } catch (e) {
      // Ignore permission/chmod error on Windows/some environments
    }
  } catch (err) {
    console.error('Failed to write temporary kaggle.json on server:', err);
  }

  const env = {
    KAGGLE_USERNAME: finalUsername,
    KAGGLE_KEY: finalKey,
    KAGGLE_CONFIG_DIR: tempDir
  };

  try {
    // Read the downloaded base notebook
    let notebookData;
    let notebookPath = BASE_NOTEBOOK_PATH;

    if (!fs.existsSync(notebookPath)) {
      // Look in the local folder as fallback
      notebookPath = path.join(__dirname, 'kokoro-tts-automation.ipynb');
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

    // Build the new config lines
    const configSource = [
      "# ============================================================\n",
      "#  USER CONFIGURATION  ← modified by Web Trigger\n",
      "# ============================================================\n",
      `ASPECT_RATIO   = "${aspect_ratio || '16:9'}"        # "16:9" or "9:16"\n`,
      "BGM_URL        = \"https://docs.google.com/uc?export=download&id=1OkWbdEFlh3N4kcl7zazUj_N0X9VzB6IP\"\n",
      "CSV_DATA_URL   = \"input_data.csv\"                   # Read locally injected file\n",
      "\n",
      "# ── Voice ────────────────────────────────────────────────────\n",
      `KOKORO_VOICE   = "${kokoro_voice || 'am_michael'}"\n`,
      "\n",
      "# ── Captions ────────────────────────────────────────────────\n",
      `CAPTION_ENABLED   = ${caption_enabled === 'true' ? 'True' : 'False'}\n`,
      `CAPTION_FONT_SIZE = ${parseInt(caption_font_size) || 22}\n`,
      `CAPTION_COLOR     = "${caption_color || 'white'}"\n`,
      `CAPTION_OUTLINE   = ${parseInt(caption_outline) || 4}\n`,
      `CAPTION_Y_POS     = ${parseFloat(caption_y_pos) || 0.80}\n`,
      "\n",
      "# ── Speed ────────────────────────────────────────────────────\n",
      `VIDEO_SPEED    = ${parseFloat(video_speed) || 1.1}\n`,
      "\n",
      "# ── Output ──────────────────────────────────────────────────\n",
      "FPS            = 24\n",
      "\n",
      "# ── HuggingFace Token ────────────────────────────────────────\n",
      `HF_TOKEN_OVERRIDE = "${hf_token_override || ''}"\n`,
      "# ============================================================\n"
    ];

    notebookData.cells[configCellIndex].source = configSource;

    // Write modified notebook
    const notebookFilename = 'kokoro-tts-automation.ipynb';
    fs.writeFileSync(
      path.join(tempDir, notebookFilename),
      JSON.stringify(notebookData, null, 2),
      'utf8'
    );

    // Create kernel-metadata.json
    const metadata = {
      id: `${finalUsername}/kokoro-tts-automation`,
      title: 'Kokoro TTS Automation',
      code_file: notebookFilename,
      language: 'python',
      kernel_type: 'notebook',
      is_private: true,
      enable_gpu: true,
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
    const pushCmd = `kaggle kernels push -p "${tempDir}"`;
    const pushResult = await runCmd(pushCmd, env);

    if (!pushResult.success) {
      throw new Error(`Kaggle CLI push failed: ${pushResult.error}\nStdout: ${pushResult.stdout}\nStderr: ${pushResult.stderr}`);
    }

    // Set initial job state
    jobs[jobId] = {
      id: jobId,
      status: 'queued',
      username: finalUsername,
      slug: 'kokoro-tts-automation',
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

      // Parse status: e.g. "username/slug has status \"running\"" or "complete"
      if (output.includes('has status "running"')) {
        job.status = 'running';
      } else if (output.includes('has status "complete"')) {
        job.status = 'downloading';
        job.log.push('[INFO] Kaggle run complete! Fetching video outputs...');
        clearInterval(timer);
        downloadOutputs(jobId);
      } else if (output.includes('has status "error"')) {
        job.status = 'error';
        job.log.push('[ERROR] Kaggle run failed with error status.');
        cleanupJobTemp(jobId);
      } else if (output.includes('has status "queued"')) {
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

  // Scan downloadDir for the MP4 file
  try {
    const outputsFolder = path.join(downloadDir, 'automated_channel_outputs');
    let videoFile = null;

    if (fs.existsSync(outputsFolder)) {
      const files = fs.readdirSync(outputsFolder);
      videoFile = files.find(f => f.endsWith('.mp4'));
    }

    if (!videoFile) {
      // Fallback: search recursively in the download directory
      const findMp4 = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory()) {
            const found = findMp4(fullPath);
            if (found) return found;
          } else if (file.endsWith('.mp4')) {
            return fullPath;
          }
        }
        return null;
      };
      videoFile = findMp4(downloadDir);
    } else {
      videoFile = path.join(outputsFolder, videoFile);
    }

    if (videoFile && fs.existsSync(videoFile)) {
      const destFilename = `video_${jobId}.mp4`;
      const destPath = path.join(OUTPUTS_DIR, destFilename);
      fs.copyFileSync(videoFile, destPath);
      
      job.status = 'complete';
      job.videoUrl = `/outputs/${destFilename}`;
      job.log.push('[SUCCESS] Video downloaded and served successfully!');
    } else {
      throw new Error('MP4 output file not found in downloaded assets.');
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
