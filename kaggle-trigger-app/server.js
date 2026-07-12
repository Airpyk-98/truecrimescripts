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
    z_image_key
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
    cellText = cellText.replace(/CSV_DATA_URL\s*=\s*['"][^'"]*['"]/, `CSV_DATA_URL   = "input_data.csv"`);

    // Dynamic bypass for Pandas storage_options error on local file read
    cellText = cellText.replace(
      'df = pd.read_csv(CSV_DATA_URL, storage_options={"User-Agent": "Mozilla/5.0"})',
      'df = pd.read_csv(CSV_DATA_URL) if not CSV_DATA_URL.startswith("http") else pd.read_csv(CSV_DATA_URL, storage_options={"User-Agent": "Mozilla/5.0"})'
    );

    notebookData.cells[configCellIndex].source = cellText.match(/[^\n]*\n|[^\n]+/g) || [];

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
