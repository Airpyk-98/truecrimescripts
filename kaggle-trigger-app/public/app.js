document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const kaggleUsernameInput = document.getElementById('kaggle-username');
  const kaggleKeyInput = document.getElementById('kaggle-key');
  const hfTokenInput = document.getElementById('hf-token');
  const backendUrlInput = document.getElementById('backend-url');
  const saveCredsBtn = document.getElementById('save-creds-btn');
  const credsSavedMsg = document.getElementById('creds-saved-msg');
  const testCredsBtn = document.getElementById('test-creds-btn');
  const credsTestMsg = document.getElementById('creds-test-msg');

  // Helper to resolve API URLs (supports custom backend domains)
  const getApiUrl = (path) => {
    const backendUrl = backendUrlInput ? backendUrlInput.value.trim().replace(/\/$/, '') : '';
    return backendUrl ? `${backendUrl}${path}` : path;
  };

  const dropZone = document.getElementById('drop-zone');
  const csvFileInput = document.getElementById('csv-file-input');
  const selectedFileDetails = document.getElementById('selected-file-details');
  const selectedFileName = document.getElementById('selected-file-name');
  const selectedFileSize = document.getElementById('selected-file-size');

  const aspectRatioSelect = document.getElementById('aspect-ratio');
  const kokoroVoiceSelect = document.getElementById('kokoro-voice');
  const videoSpeedInput = document.getElementById('video-speed');
  const speedVal = document.getElementById('speed-val');
  const captionEnabledCheckbox = document.getElementById('caption-enabled');

  const advToggle = document.getElementById('adv-toggle');
  const advBody = document.getElementById('adv-body');
  const captionFontSizeInput = document.getElementById('caption-font-size');
  const captionColorPicker = document.getElementById('caption-color-picker');
  const captionColorText = document.getElementById('caption-color-text');
  const captionOutlineInput = document.getElementById('caption-outline');
  const captionYPosInput = document.getElementById('caption-y-pos');
  const yPosVal = document.getElementById('y-pos-val');

  const triggerPipelineBtn = document.getElementById('trigger-pipeline-btn');
  const btnText = triggerPipelineBtn.querySelector('.btn-text');
  const spinner = triggerPipelineBtn.querySelector('.spinner');

  const statusIndicator = document.getElementById('status-indicator');
  const statusText = statusIndicator.querySelector('.status-text');
  const progressContainer = document.getElementById('progress-container');
  const progressStage = document.getElementById('progress-stage');
  const elapsedTimerText = document.getElementById('elapsed-time');
  const progressFill = document.getElementById('progress-fill');
  const consoleOutput = document.getElementById('console-output');
  const clearLogsBtn = document.getElementById('clear-logs');

  const outputCard = document.getElementById('output-card');
  const videoPreviewContainer = document.getElementById('video-preview-container');
  const downloadVideoBtn = document.getElementById('download-video-btn');
  const copyLinkBtn = document.getElementById('copy-link-btn');
  const copyBtnText = document.getElementById('copy-btn-text');
  const linkCopiedMsg = document.getElementById('link-copied-msg');

  let selectedFile = null;
  let pollingInterval = null;
  let elapsedSeconds = 0;
  let elapsedTimer = null;

  // ── 1. Load Stored Credentials ──────────────────────────────
  const loadCredentials = () => {
    const storedUsername = localStorage.getItem('kaggle_username');
    const storedKey = localStorage.getItem('kaggle_key');
    const storedHf = localStorage.getItem('hf_token');
    const storedBackend = localStorage.getItem('backend_url');

    if (storedUsername) kaggleUsernameInput.value = storedUsername;
    if (storedKey) kaggleKeyInput.value = storedKey;
    if (storedHf) hfTokenInput.value = storedHf;
    if (storedBackend) backendUrlInput.value = storedBackend;

    // Check if Kaggle credentials already exist in the environment/PC
    fetch(getApiUrl('/api/check-local-kaggle'))
      .then(res => res.json())
      .then(data => {
        if (data.exists && !storedUsername) {
          addLogLine(`[SYSTEM] Found local Kaggle CLI credentials for user: ${data.username}`, 'system');
          kaggleUsernameInput.value = data.username;
          // Store locally in browser
          localStorage.setItem('kaggle_username', data.username);
        }
      })
      .catch(err => console.error('Error checking local credentials:', err));
  };

  loadCredentials();

  // Save Credentials Click
  saveCredsBtn.addEventListener('click', () => {
    const username = kaggleUsernameInput.value.trim();
    const key = kaggleKeyInput.value.trim();
    const hf = hfTokenInput.value.trim();
    const backend = backendUrlInput.value.trim();

    localStorage.setItem('kaggle_username', username);
    localStorage.setItem('kaggle_key', key);
    localStorage.setItem('hf_token', hf);
    localStorage.setItem('backend_url', backend);

    // Call server to write credentials to ~/.kaggle/kaggle.json (for local usage)
    fetch(getApiUrl('/api/setup-local-kaggle'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, key })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        addLogLine('[SYSTEM] Kaggle API keys synchronized and saved.', 'success');
      } else {
        addLogLine(`[WARN] Local environment save error: ${data.error}`, 'system');
      }
    })
    .catch(err => console.error(err));

    credsSavedMsg.style.display = 'block';
    setTimeout(() => {
      credsSavedMsg.style.display = 'none';
    }, 3000);
  });

  // Test Credentials Click
  testCredsBtn.addEventListener('click', () => {
    const username = kaggleUsernameInput.value.trim();
    const key = kaggleKeyInput.value.trim();

    if (!username || !key) {
      alert('Please fill in both Kaggle Username and API Key first.');
      return;
    }

    testCredsBtn.disabled = true;
    testCredsBtn.textContent = 'Testing...';
    credsTestMsg.style.display = 'block';
    credsTestMsg.style.background = 'rgba(255, 255, 255, 0.05)';
    credsTestMsg.style.color = '#ccc';
    credsTestMsg.textContent = 'Verifying credentials with Kaggle API...';

    fetch(getApiUrl('/api/test-kaggle'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kaggle_username: username, kaggle_key: key })
    })
    .then(async res => {
      const data = await res.json();
      if (res.ok) {
        credsTestMsg.style.background = 'rgba(46, 213, 115, 0.1)';
        credsTestMsg.style.color = '#2ed573';
        credsTestMsg.style.border = '1px solid rgba(46, 213, 115, 0.2)';
        credsTestMsg.textContent = '✓ ' + data.message;
        addLogLine('[SYSTEM] Kaggle API connection test succeeded!', 'success');
      } else {
        throw new Error(data.error || 'Verification failed');
      }
    })
    .catch(err => {
      credsTestMsg.style.background = 'rgba(255, 71, 87, 0.1)';
      credsTestMsg.style.color = '#ff4757';
      credsTestMsg.style.border = '1px solid rgba(255, 71, 87, 0.2)';
      credsTestMsg.textContent = '✗ ' + err.message;
      addLogLine(`[ERROR] Kaggle API test failed: ${err.message}`, 'error');
    })
    .finally(() => {
      testCredsBtn.disabled = false;
      testCredsBtn.textContent = 'Test Connection';
    });
  });

  // ── 2. Sync range display text ──────────────────────────────
  videoSpeedInput.addEventListener('input', (e) => {
    speedVal.textContent = parseFloat(e.target.value).toFixed(2) + 'x';
  });

  captionYPosInput.addEventListener('input', (e) => {
    yPosVal.textContent = parseFloat(e.target.value).toFixed(2);
  });

  // Sync Color Picker with text field
  captionColorPicker.addEventListener('input', (e) => {
    captionColorText.value = e.target.value;
  });

  captionColorText.addEventListener('input', (e) => {
    const val = e.target.value;
    if (val.startsWith('#') && val.length === 7) {
      captionColorPicker.value = val;
    }
  });

  // Toggle Advanced Settings
  advToggle.addEventListener('click', () => {
    advToggle.classList.toggle('active');
    advBody.style.display = advToggle.classList.contains('active') ? 'block' : 'none';
  });

  // ── 3. Drag & Drop CSV Logic ────────────────────────────────
  dropZone.addEventListener('click', () => csvFileInput.click());

  csvFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv')) {
        csvFileInput.files = e.dataTransfer.files;
        handleFileSelected(file);
      } else {
        addLogLine('[ERROR] Invalid file type. Only CSV files are accepted.', 'error');
      }
    }
  });

  const handleFileSelected = (file) => {
    selectedFile = file;
    selectedFileName.textContent = file.name;
    selectedFileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
    selectedFileDetails.style.display = 'inline-flex';
    addLogLine(`[SYSTEM] Loaded CSV script: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  };

  // ── 4. Log Helper ───────────────────────────────────────────
  const addLogLine = (text, type = '') => {
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    // Timestamp
    const time = new Date().toLocaleTimeString();
    line.innerHTML = `<span style="color: var(--text-muted)">[${time}]</span> ${text}`;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  };

  clearLogsBtn.addEventListener('click', () => {
    consoleOutput.innerHTML = '';
  });

  // ── 5. Trigger Pipeline Execution ──────────────────────────
  triggerPipelineBtn.addEventListener('click', () => {
    if (!selectedFile) {
      alert('Please upload a script CSV file first.');
      return;
    }

    const username = kaggleUsernameInput.value.trim();
    const key = kaggleKeyInput.value.trim();
    if (!username || !key) {
      alert('Please input your Kaggle username and API key.');
      return;
    }

    // Disable triggers
    setPipelineRunning(true);
    outputCard.style.display = 'none';

    // Clear and reset status
    consoleOutput.innerHTML = '';
    addLogLine('[SYSTEM] Preparing video automation payload...', 'system');
    
    // Prepare Multi-part Form Payload
    const formData = new FormData();
    formData.append('csvFile', selectedFile);
    formData.append('aspect_ratio', aspectRatioSelect.value);
    formData.append('kokoro_voice', kokoroVoiceSelect.value);
    formData.append('caption_enabled', captionEnabledCheckbox.checked ? 'true' : 'false');
    formData.append('caption_font_size', captionFontSizeInput.value);
    formData.append('caption_color', captionColorText.value);
    formData.append('caption_outline', captionOutlineInput.value);
    formData.append('caption_y_pos', captionYPosInput.value);
    formData.append('video_speed', videoSpeedInput.value);
    formData.append('hf_token_override', hfTokenInput.value.trim());
    formData.append('kaggle_username', username);
    formData.append('kaggle_key', key);

    // Call backend trigger route
    fetch(getApiUrl('/api/trigger'), {
      method: 'POST',
      body: formData
    })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start execution.');
      }
      return data;
    })
    .then((data) => {
      addLogLine(`[SUCCESS] Kaggle run triggered! Job ID: ${data.jobId}`, 'success');
      startPolling(data.jobId);
    })
    .catch((err) => {
      addLogLine(`[ERROR] Trigger failed: ${err.message}`, 'error');
      setPipelineRunning(false);
    });
  });

  // Toggle running states in UI
  const setPipelineRunning = (isRunning) => {
    triggerPipelineBtn.disabled = isRunning;
    csvFileInput.disabled = isRunning;
    aspectRatioSelect.disabled = isRunning;
    kokoroVoiceSelect.disabled = isRunning;
    videoSpeedInput.disabled = isRunning;
    captionEnabledCheckbox.disabled = isRunning;
    
    if (isRunning) {
      btnText.textContent = 'Pipeline Active...';
      spinner.style.display = 'inline-block';
      progressContainer.style.display = 'flex';
      updateProgress(5, 'Triggering run...');
      
      // Start Elapsed Timer
      elapsedSeconds = 0;
      elapsedTimerText.textContent = '0s';
      elapsedTimer = setInterval(() => {
        elapsedSeconds++;
        const mins = Math.floor(elapsedSeconds / 60);
        const secs = elapsedSeconds % 60;
        elapsedTimerText.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      }, 1000);
    } else {
      btnText.textContent = 'Generate Video on Kaggle';
      spinner.style.display = 'none';
      if (elapsedTimer) clearInterval(elapsedTimer);
    }
  };

  // Update Progress Track
  const updateProgress = (pct, stage) => {
    progressFill.style.width = `${pct}%`;
    progressStage.textContent = stage;
  };

  // Update Status Indicator Box
  const updateStatusIndicator = (status) => {
    // Reset classes
    statusIndicator.className = 'status-indicator ' + status;
    statusText.textContent = status;
  };

  // ── 6. Status Polling Loop ──────────────────────────────────
  const startPolling = (jobId) => {
    if (pollingInterval) clearInterval(pollingInterval);
    updateStatusIndicator('queued');

    pollingInterval = setInterval(() => {
      fetch(getApiUrl(`/api/status/${jobId}`))
        .then(res => res.json())
        .then(data => {
          // Sync Logs (only log new lines)
          const currentLogLines = consoleOutput.querySelectorAll('.log-line').length;
          if (data.log && data.log.length > currentLogLines) {
            for (let i = currentLogLines; i < data.log.length; i++) {
              const line = data.log[i];
              if (line.includes('[SUCCESS]')) {
                addLogLine(line, 'success');
              } else if (line.includes('[ERROR]')) {
                addLogLine(line, 'error');
              } else if (line.includes('[INFO]') || line.includes('[WARN]')) {
                addLogLine(line, 'system');
              } else {
                addLogLine(line);
              }
            }
          }

          // Handle stages/progress updates
          if (data.status === 'queued') {
            updateStatusIndicator('queued');
            updateProgress(15, 'Queued in Kaggle background pipeline...');
          } else if (data.status === 'running') {
            updateStatusIndicator('running');
            
            // Guess progress from log contents
            let pct = 30;
            let msg = 'Rendering video assets on GPU (Flux)...';
            
            const logStr = data.log.join('\n');
            if (logStr.includes('PHASE 2:')) {
              pct = 50;
              msg = 'Generating expression voices (Kokoro TTS)...';
            }
            if (logStr.includes('PHASE 3:')) {
              pct = 70;
              msg = 'Burning captions and camera motion (FFmpeg)...';
            }
            if (logStr.includes('PHASE 4:')) {
              pct = 85;
              msg = 'Stitching voice and video timelines (FFmpeg)...';
            }
            if (logStr.includes('PHASE 5:')) {
              pct = 95;
              msg = 'Mixing background music and exporting (FFmpeg)...';
            }
            updateProgress(pct, msg);
          } else if (data.status === 'downloading') {
            updateStatusIndicator('downloading');
            updateProgress(98, 'Downloading final MP4 video from Kaggle...');
          } else if (data.status === 'complete') {
            updateStatusIndicator('complete');
            updateProgress(100, 'Video Render Complete!');
            clearInterval(pollingInterval);
            setPipelineRunning(false);
            
            // Present video output
            showOutputVideo(data.videoUrl, data.aspectRatio);
          } else if (data.status === 'error') {
            updateStatusIndicator('error');
            updateProgress(100, 'Pipeline Error!');
            clearInterval(pollingInterval);
            setPipelineRunning(false);
            addLogLine('[ERROR] The background Kaggle execution failed.', 'error');
          }
        })
        .catch(err => {
          console.error('Polling error:', err);
        });
    }, 5000); // Poll every 5s
  };

  // ── 7. Output Display & Video Inject ────────────────────────
  const showOutputVideo = (videoUrl, aspectRatio) => {
    // Determine preview aspect ratio styles
    const isVertical = aspectRatio === '9:16';
    videoPreviewContainer.className = 'video-preview-wrapper' + (isVertical ? ' vertical' : '');

    // Inject video tag
    const backendUrl = backendUrlInput ? backendUrlInput.value.trim().replace(/\/$/, '') : '';
    const fullVideoUrl = backendUrl ? `${backendUrl}${videoUrl}` : (window.location.origin + videoUrl);
    
    videoPreviewContainer.innerHTML = `
      <video controls>
        <source src="${fullVideoUrl}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
    `;

    // Configure download buttons
    downloadVideoBtn.href = fullVideoUrl;
    downloadVideoBtn.setAttribute('download', `final_video_${aspectRatio.replace(':', '_')}.mp4`);

    // Setup Copy URL Button
    copyLinkBtn.onclick = () => {
      navigator.clipboard.writeText(fullVideoUrl)
        .then(() => {
          linkCopiedMsg.style.display = 'block';
          copyBtnText.textContent = 'Copied!';
          setTimeout(() => {
            linkCopiedMsg.style.display = 'none';
            copyBtnText.textContent = 'Copy Download Link';
          }, 3000);
        })
        .catch(err => {
          console.error('Failed to copy link:', err);
          alert('Failed to copy link. You can download it directly instead.');
        });
    };

    outputCard.style.display = 'block';
    outputCard.scrollIntoView({ behavior: 'smooth' });
  };
});
