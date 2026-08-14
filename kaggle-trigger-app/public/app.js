document.addEventListener('DOMContentLoaded', () => {
  // ═══════════════════════════════════════════════════════════
  // DOM ELEMENTS
  // ═══════════════════════════════════════════════════════════
  const kaggleUsernameInput = document.getElementById('kaggle-username');
  const kaggleKeyInput = document.getElementById('kaggle-key');
  const hfTokenInput = document.getElementById('hf-token');
  const backendUrlInput = document.getElementById('backend-url');
  const saveCredsBtn = document.getElementById('save-creds-btn');
  const credsSavedMsg = document.getElementById('creds-saved-msg');
  const testCredsBtn = document.getElementById('test-creds-btn');
  const credsTestMsg = document.getElementById('creds-test-msg');

  const useZImageToggle = document.getElementById('use-z-image');
  const zImageKeyGroup = document.getElementById('z-image-key-group');
  const zImageKeyInput = document.getElementById('z-image-key');

  const useBgmToggle = document.getElementById('use-bgm');
  const bgmVolumeInput = document.getElementById('bgm-volume');
  const bgmVolVal = document.getElementById('bgm-vol-val');
  const bgmVolumeGroup = document.getElementById('bgm-volume-group');

  const aiBaseUrlInput = document.getElementById('ai-base-url');
  const aiApiKeyInput = document.getElementById('ai-api-key');
  const fetchModelsBtn = document.getElementById('fetch-models-btn');
  const aiModelGroup = document.getElementById('ai-model-group');
  const aiModelSelect = document.getElementById('ai-model');

  const titlesInput = document.getElementById('titles-input');

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

  const historyList = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const logBadge = document.getElementById('log-badge');

  let selectedFile = null;
  let pollingInterval = null;
  let elapsedSeconds = 0;
  let elapsedTimer = null;

  // Helper to resolve API URLs
  const getApiUrl = (path) => {
    let backendUrl = backendUrlInput ? backendUrlInput.value.trim().replace(/\/$/, '') : '';
    // IMPORTANT FIX: Hard fallback to epic98 if left empty, because Airpyk98 is broken/cached in user's browser
    if (!backendUrl || backendUrl.includes("Airpyk98")) {
        backendUrl = "https://epic98-truecrime-video-generator.hf.space";
        if (backendUrlInput) {
            backendUrlInput.value = backendUrl;
            localStorage.setItem('backendUrl', backendUrl);
        }
    }
    return backendUrl ? `${backendUrl}${path}` : path;
  };

  // ═══════════════════════════════════════════════════════════
  // 1. TAB SWITCHING
  // ═══════════════════════════════════════════════════════════
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  const switchTab = (tabName) => {
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    tabContents.forEach(tc => tc.classList.toggle('active', tc.id === `tab-${tabName}`));
    localStorage.setItem('active_tab', tabName);
  };

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Restore last active tab
  const savedTab = localStorage.getItem('active_tab');
  if (savedTab) switchTab(savedTab);

  // ═══════════════════════════════════════════════════════════
  // 2. LOAD / SAVE CREDENTIALS
  // ═══════════════════════════════════════════════════════════
  const loadCredentials = () => {
    const s = (k) => localStorage.getItem(k) || '';
    kaggleUsernameInput.value = s('kaggle_username');
    kaggleKeyInput.value = s('kaggle_key');
    hfTokenInput.value = s('hf_token');
    backendUrlInput.value = s('backend_url');
    zImageKeyInput.value = s('z_image_key');

    aiBaseUrlInput.value = s('ai_base_url') || 'https://integrate.api.nvidia.com/v1';
    aiApiKeyInput.value = s('ai_api_key');

    if (localStorage.getItem('use_z_image') === 'true') {
      useZImageToggle.checked = true;
      zImageKeyGroup.style.display = 'block';
    }

    // Check server for local Kaggle creds
    fetch(getApiUrl('/api/check-local-kaggle'))
      .then(res => res.json())
      .then(data => {
        if (data.exists && !s('kaggle_username')) {
          addLogLine(`[SYSTEM] Found local Kaggle CLI credentials for user: ${data.username}`, 'system');
          kaggleUsernameInput.value = data.username;
          localStorage.setItem('kaggle_username', data.username);
        }
      })
      .catch(() => {});
  };

  loadCredentials();

  saveCredsBtn.addEventListener('click', () => {
    localStorage.setItem('kaggle_username', kaggleUsernameInput.value.trim());
    localStorage.setItem('kaggle_key', kaggleKeyInput.value.trim());
    localStorage.setItem('hf_token', hfTokenInput.value.trim());
    localStorage.setItem('backend_url', backendUrlInput.value.trim());
    localStorage.setItem('use_z_image', useZImageToggle.checked);
    localStorage.setItem('z_image_key', zImageKeyInput.value.trim());

    localStorage.setItem('ai_base_url', aiBaseUrlInput.value.trim());
    localStorage.setItem('ai_api_key', aiApiKeyInput.value.trim());

    // Sync to server
    fetch(getApiUrl('/api/setup-local-kaggle'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: kaggleUsernameInput.value.trim(),
        key: kaggleKeyInput.value.trim()
      })
    }).then(r => r.json()).then(d => {
      if (d.success) addLogLine('[SYSTEM] Kaggle API keys synchronized.', 'success');
    }).catch(() => {});

    credsSavedMsg.style.display = 'block';
    setTimeout(() => { credsSavedMsg.style.display = 'none'; }, 3000);
  });

  // Test Connection
  testCredsBtn.addEventListener('click', () => {
    const username = kaggleUsernameInput.value.trim();
    const key = kaggleKeyInput.value.trim();
    if (!username || !key) { alert('Please fill in both Kaggle Username and API Key first.'); return; }

    testCredsBtn.disabled = true;
    testCredsBtn.innerHTML = '<span>⏳</span> Testing...';
    credsTestMsg.style.display = 'block';
    credsTestMsg.style.background = 'rgba(255,255,255,0.05)';
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
        credsTestMsg.style.background = 'rgba(46,213,115,0.1)';
        credsTestMsg.style.color = '#2ed573';
        credsTestMsg.style.border = '1px solid rgba(46,213,115,0.2)';
        credsTestMsg.textContent = '✓ ' + data.message;
      } else {
        throw new Error(data.error || 'Verification failed');
      }
    })
    .catch(err => {
      credsTestMsg.style.background = 'rgba(255,71,87,0.1)';
      credsTestMsg.style.color = '#ff4757';
      credsTestMsg.style.border = '1px solid rgba(255,71,87,0.2)';
      credsTestMsg.textContent = '✗ ' + err.message;
    })
    .finally(() => {
      testCredsBtn.disabled = false;
      testCredsBtn.innerHTML = '<span>🔌</span> Test Kaggle Connection';
    });
  });

  // Z Image toggle
  useZImageToggle.addEventListener('change', (e) => {
    zImageKeyGroup.style.display = e.target.checked ? 'block' : 'none';
  });

  // ═══════════════════════════════════════════════════════════
  // 3. UI CONTROLS (range sliders, color, advanced)
  // ═══════════════════════════════════════════════════════════
  videoSpeedInput.addEventListener('input', (e) => { speedVal.textContent = parseFloat(e.target.value).toFixed(2) + 'x'; });
  captionYPosInput.addEventListener('input', (e) => { yPosVal.textContent = parseFloat(e.target.value).toFixed(2); });
  
  bgmVolumeInput.addEventListener('input', (e) => { bgmVolVal.textContent = parseFloat(e.target.value).toFixed(2); });
  useBgmToggle.addEventListener('change', () => {
    bgmVolumeGroup.style.display = useBgmToggle.checked ? 'flex' : 'none';
  });

  useZImageToggle.addEventListener('change', () => {
    zImageKeyGroup.style.display = useZImageToggle.checked ? 'block' : 'none';
  });
  captionColorPicker.addEventListener('input', (e) => { captionColorText.value = e.target.value; });
  captionColorText.addEventListener('input', (e) => { if (e.target.value.startsWith('#') && e.target.value.length === 7) captionColorPicker.value = e.target.value; });
  advToggle.addEventListener('click', () => {
    advToggle.classList.toggle('active');
    advBody.style.display = advToggle.classList.contains('active') ? 'block' : 'none';
  });

  // ═══════════════════════════════════════════════════════════
  // 4. AI MODEL FETCHING
  // ═══════════════════════════════════════════════════════════
  fetchModelsBtn.addEventListener('click', async () => {
    const baseUrl = aiBaseUrlInput.value.trim();
    const apiKey = aiApiKeyInput.value.trim();
    if (!baseUrl || !apiKey) {
      alert('Please enter a Base URL and API Key.');
      return;
    }
    
    fetchModelsBtn.disabled = true;
    fetchModelsBtn.innerHTML = '<span>⏳</span> Fetching Models...';
    
    try {
      const response = await fetch(getApiUrl('/api/models'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: baseUrl, api_key: apiKey })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch models');
      
      aiModelSelect.innerHTML = '';
      if (data.data && Array.isArray(data.data)) {
        data.data.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.id;
          if (model.id.toLowerCase().includes('minimax') || model.id.toLowerCase().includes('m3')) {
            option.selected = true;
          }
          aiModelSelect.appendChild(option);
        });
        aiModelGroup.style.display = 'flex';
        addLogLine('[SYSTEM] Models fetched successfully.', 'success');
      } else {
        throw new Error('Unexpected model list format.');
      }
    } catch (err) {
      alert('Error fetching models: ' + err.message);
      addLogLine('[ERROR] ' + err.message, 'error');
    } finally {
      fetchModelsBtn.disabled = false;
      fetchModelsBtn.innerHTML = '<span>🔄</span> Fetch Available Models';
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 5. LOG HELPER (persists to localStorage)
  // ═══════════════════════════════════════════════════════════
  const addLogLine = (text, type = '') => {
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    const time = new Date().toLocaleTimeString();
    line.innerHTML = `<span style="color: var(--text-muted)">[${time}]</span> ${text}`;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;

    // Persist log lines for active job
    const activeJob = localStorage.getItem('active_job_id');
    if (activeJob) {
      let logs = [];
      try { logs = JSON.parse(localStorage.getItem('active_job_logs') || '[]'); } catch (e) {}
      logs.push({ text, type, time });
      localStorage.setItem('active_job_logs', JSON.stringify(logs));
    }
  };

  clearLogsBtn.addEventListener('click', () => { consoleOutput.innerHTML = ''; });

  // ═══════════════════════════════════════════════════════════
  // 6. PIPELINE TRIGGER
  // ═══════════════════════════════════════════════════════════
  triggerPipelineBtn.addEventListener('click', () => {
    const rawTitles = titlesInput.value.trim();
    if (!rawTitles) { alert('Please paste at least one video title.'); return; }
    const titlesArray = rawTitles.split('\\n').map(t => t.trim()).filter(t => t.length > 0);
    if (titlesArray.length === 0) { alert('No valid titles found.'); return; }
    
    const username = kaggleUsernameInput.value.trim();
    const key = kaggleKeyInput.value.trim();
    if (!username || !key) { alert('Please input your Kaggle username and API key in the Credentials tab.'); return; }

    const aiBaseUrl = aiBaseUrlInput.value.trim();
    const aiApiKey = aiApiKeyInput.value.trim();
    const aiModel = aiModelSelect.value || '';
    if (!aiBaseUrl || !aiApiKey || !aiModel) { alert('Please configure the AI Script Generator in the Credentials tab.'); return; }

    setPipelineRunning(true);
    outputCard.style.display = 'none';
    videoPreviewContainer.innerHTML = '';
    consoleOutput.innerHTML = '';
    addLogLine(`[SYSTEM] Preparing payload for ${titlesArray.length} titles...`, 'system');

    const formData = new FormData();
    formData.append('titles', JSON.stringify(titlesArray));
    formData.append('ai_base_url', aiBaseUrl);
    formData.append('ai_api_key', aiApiKey);
    formData.append('ai_model', aiModel);

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
    formData.append('use_z_image', useZImageToggle.checked ? 'true' : 'false');
    formData.append('z_image_key', zImageKeyInput.value.trim());
    formData.append('use_bgm', useBgmToggle.checked ? 'true' : 'false');
    formData.append('bgm_volume', bgmVolumeInput.value);
    formData.append('upscale_mode', document.getElementById('upscale-mode').value);

    fetch(getApiUrl('/api/trigger-titles'), { method: 'POST', body: formData })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start execution.');
      return data;
    })
    .then((data) => {
      addLogLine(`[SUCCESS] Kaggle run triggered! Job ID: ${data.jobId}`, 'success');
      // Persist active job state
      localStorage.setItem('active_job_id', data.jobId);
      localStorage.setItem('active_job_start', Date.now().toString());
      localStorage.setItem('active_job_logs', '[]');
      localStorage.setItem('active_job_status', 'queued');
      startPolling(data.jobId);
    })
    .catch((err) => {
      addLogLine(`[ERROR] Trigger failed: ${err.message}`, 'error');
      setPipelineRunning(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. PIPELINE STATE MANAGEMENT (survives refresh)
  // ═══════════════════════════════════════════════════════════
  const setPipelineRunning = (isRunning) => {
    triggerPipelineBtn.disabled = isRunning;
    csvFileInput.disabled = isRunning;

    if (isRunning) {
      btnText.textContent = 'Pipeline Active...';
      spinner.style.display = 'inline-block';
      progressContainer.style.display = 'flex';
      updateProgress(5, 'Triggering run...');

      // Start elapsed timer from stored start or now
      const startTime = parseInt(localStorage.getItem('active_job_start') || Date.now());
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      updateElapsedDisplay();

      if (elapsedTimer) clearInterval(elapsedTimer);
      elapsedTimer = setInterval(() => {
        elapsedSeconds++;
        updateElapsedDisplay();
      }, 1000);
    } else {
      btnText.textContent = 'Generate Video on Kaggle';
      spinner.style.display = 'none';
      if (elapsedTimer) clearInterval(elapsedTimer);
    }
  };

  const updateElapsedDisplay = () => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    elapsedTimerText.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const updateProgress = (pct, stage) => {
    progressFill.style.width = `${pct}%`;
    progressStage.textContent = stage;
    // Persist
    localStorage.setItem('active_job_progress', JSON.stringify({ pct, stage }));
  };

  const updateStatusIndicator = (status) => {
    statusIndicator.className = 'status-indicator ' + status;
    statusText.textContent = status;
    localStorage.setItem('active_job_status', status);
  };

  // ═══════════════════════════════════════════════════════════
  // 8. STATUS POLLING LOOP
  // ═══════════════════════════════════════════════════════════
  const startPolling = (jobId) => {
    if (pollingInterval) clearInterval(pollingInterval);
    updateStatusIndicator('queued');

    let lastLogCount = 0;
    // Fast-forward logs if resuming
    try {
        let savedLogs = JSON.parse(localStorage.getItem('active_job_logs') || '[]');
        lastLogCount = savedLogs.length;
    } catch(e) {}

    pollingInterval = setInterval(() => {
      fetch(getApiUrl(`/api/status/${jobId}`))
        .then(async res => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Server error');
          return data;
        })
        .then(data => {
          // Sync logs (only add new lines)
          if (data.log && data.log.length > lastLogCount) {
            for (let i = lastLogCount; i < data.log.length; i++) {
              const line = data.log[i];
              let type = '';
              if (line.includes('[SUCCESS]')) type = 'success';
              else if (line.includes('[ERROR]')) type = 'error';
              else if (line.includes('[INFO]') || line.includes('[WARN]')) type = 'system';
              addLogLine(line, type);
            }
            lastLogCount = data.log.length;
          }

          // Status transitions
          if (data.status === 'queued') {
            updateStatusIndicator('queued');
            updateProgress(15, 'Queued in Kaggle background pipeline...');
          } else if (data.status === 'running') {
            updateStatusIndicator('running');
            
            // Check if we are doing batch titles
            if (data.titlesTotal > 0) {
              const currentTitle = data.titlesDone + 1;
              const displayTitle = currentTitle <= data.titlesTotal ? currentTitle : data.titlesTotal;
              
              // Incrementally show completed videos
              if (data.completedVideos && data.completedVideos.length > 0) {
                 showOutputVideo(data.completedVideos, data.aspectRatio);
              }
              
              let pct = Math.floor((data.titlesDone / data.titlesTotal) * 100);
              let msg = `Generating title ${displayTitle} of ${data.titlesTotal}...`;
              updateProgress(pct || 5, msg);
            } else {
              let pct = 30, msg = 'Rendering video assets on GPU...';
            const logStr = data.log.join('\n');
            if (logStr.includes('PHASE 2:')) { pct = 50; msg = 'Generating voices (Kokoro TTS)...'; }
            if (logStr.includes('PHASE 3:')) { pct = 70; msg = 'Burning captions + motion (FFmpeg)...'; }
            if (logStr.includes('PHASE 4:')) { pct = 85; msg = 'Stitching voice + video (FFmpeg)...'; }
            if (logStr.includes('PHASE 5:')) { pct = 95; msg = 'Mixing BGM and exporting (FFmpeg)...'; }
            updateProgress(pct, msg);
            }
          } else if (data.status === 'downloading') {
            updateStatusIndicator('downloading');
            updateProgress(98, 'Downloading final MP4 from Kaggle...');
          } else if (data.status === 'complete') {
            updateStatusIndicator('complete');
            updateProgress(100, 'Video Render Complete!');
            clearInterval(pollingInterval);
            pollingInterval = null;
            setPipelineRunning(false);
            const urls = data.videoUrls || (data.videoUrl ? [data.videoUrl] : []);
            const finalOutputs = (data.completedVideos && data.completedVideos.length > 0) ? data.completedVideos : urls;
            showOutputVideo(finalOutputs, data.aspectRatio);
            saveToHistory(finalOutputs, data.aspectRatio, jobId, 'success');
            clearActiveJob();
          } else if (data.status === 'error') {
            updateStatusIndicator('error');
            updateProgress(100, 'Pipeline Error!');
            clearInterval(pollingInterval);
            pollingInterval = null;
            setPipelineRunning(false);
            addLogLine('[ERROR] The background Kaggle execution failed.', 'error');
            saveToHistory(null, null, jobId, 'failed');
            clearActiveJob();
          }
        })
        .catch(err => {
          console.error('Polling error:', err);
          if (err.message.includes('not found') || err.message.includes('Server error')) {
            updateStatusIndicator('error');
            updateProgress(100, 'Job not found / Cancelled.');
            clearInterval(pollingInterval);
            pollingInterval = null;
            setPipelineRunning(false);
            addLogLine('[ERROR] The job was cancelled or no longer exists.', 'error');
            saveToHistory(null, null, jobId, 'failed');
            clearActiveJob();
          }
        });
    }, 5000);
  };

  const clearActiveJob = () => {
    localStorage.removeItem('active_job_id');
    localStorage.removeItem('active_job_start');
    localStorage.removeItem('active_job_logs');
    localStorage.removeItem('active_job_status');
    localStorage.removeItem('active_job_progress');
  };

  // ═══════════════════════════════════════════════════════════
  // 9. RESUME ACTIVE JOB ON PAGE LOAD
  // ═══════════════════════════════════════════════════════════
  const resumeActiveJob = () => {
    const activeJobId = localStorage.getItem('active_job_id');
    if (!activeJobId) return;

    const activeStatus = localStorage.getItem('active_job_status');
    if (activeStatus === 'complete' || activeStatus === 'error') {
      clearActiveJob();
      return;
    }

    // Restore UI state
    consoleOutput.innerHTML = '';

    // Restore saved logs
    let savedLogs = [];
    try { savedLogs = JSON.parse(localStorage.getItem('active_job_logs') || '[]'); } catch (e) {}
    savedLogs.forEach(entry => {
      const line = document.createElement('div');
      line.className = `log-line ${entry.type || ''}`;
      line.innerHTML = `<span style="color: var(--text-muted)">[${entry.time}]</span> ${entry.text}`;
      consoleOutput.appendChild(line);
    });
    consoleOutput.scrollTop = consoleOutput.scrollHeight;

    // Restore progress
    let savedProgress = { pct: 15, stage: 'Resuming...' };
    try { savedProgress = JSON.parse(localStorage.getItem('active_job_progress') || '{}'); } catch (e) {}

    // Switch to execution tab and show running state
    switchTab('execution');
    setPipelineRunning(true);
    updateStatusIndicator(activeStatus || 'running');
    updateProgress(savedProgress.pct || 15, savedProgress.stage || 'Resuming pipeline monitoring...');

    // Restart polling
    startPolling(activeJobId);
  };

  resumeActiveJob();

  // ═══════════════════════════════════════════════════════════
  // 10. OUTPUT VIDEO DISPLAY
  // ═══════════════════════════════════════════════════════════
  const showOutputVideo = (outputs, aspectRatio) => {
    const isVertical = aspectRatio === '9:16';
    videoPreviewContainer.className = 'video-preview-wrapper' + (isVertical ? ' vertical' : '');
    videoPreviewContainer.style.flexDirection = 'row';
    videoPreviewContainer.style.flexWrap = 'wrap';
    videoPreviewContainer.style.gap = '16px';
    videoPreviewContainer.style.justifyContent = 'center';

    videoPreviewContainer.innerHTML = '';
    const downloadBtnsContainer = document.querySelector('.output-actions');
    downloadBtnsContainer.innerHTML = '';

    const backendUrl = backendUrlInput ? backendUrlInput.value.trim().replace(/\/$/, '') : '';

    const flatUrls = [];

    outputs.forEach((item, idx) => {
      const isObject = typeof item === 'object' && item !== null;
      const title = isObject ? item.title : ('Video ' + (idx + 1));
      const urls = isObject ? item.urls : [item];
      
      urls.forEach((url, sIdx) => {
        const fullVideoUrl = backendUrl ? `${backendUrl}${url}` : (window.location.origin + url);
        flatUrls.push(fullVideoUrl);
        const isUpscaled = url.includes('upscaled');
        const label = isObject ? `${title} ${isUpscaled ? '(Upscaled)' : ''}` : (isUpscaled ? 'Upscaled Video' : 'Normal Video');

        const vidWrapper = document.createElement('div');
        vidWrapper.style.display = 'flex';
        vidWrapper.style.flexDirection = 'column';
        vidWrapper.style.alignItems = 'center';
        vidWrapper.style.gap = '8px';
        
        vidWrapper.innerHTML = `
          <h4 style="color: var(--text-muted); font-size: 14px; margin: 0; text-align: center; max-width: 250px;">${label}</h4>
          <video controls style="max-height: 400px; border-radius: 8px;">
            <source src="${fullVideoUrl}" type="video/mp4">Your browser does not support the video tag.
          </video>
        `;
        videoPreviewContainer.appendChild(vidWrapper);

        const dBtn = document.createElement('a');
        dBtn.href = fullVideoUrl;
        dBtn.className = 'btn primary-btn download-btn';
        dBtn.style.marginBottom = '8px';
        dBtn.innerHTML = `<span>Download ${isObject ? 'MP4' : label}</span>`;
        
        dBtn.onclick = (e) => {
          e.preventDefault();
          const btnSpan = dBtn.querySelector('span');
          const orig = btnSpan.textContent;
          btnSpan.textContent = 'Downloading...';
          dBtn.style.pointerEvents = 'none';
          dBtn.style.opacity = '0.7';

          fetch(fullVideoUrl)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
            .then(blob => {
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              let sanitized = title.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 30);
              a.download = isObject ? `${sanitized}${isUpscaled ? '_upscaled' : ''}.mp4` : `final_video_${isUpscaled ? 'upscaled_' : ''}${aspectRatio.replace(':', '_')}.mp4`;
              a.click();
              URL.revokeObjectURL(a.href);
            })
            .catch(() => window.open(fullVideoUrl, '_blank'))
            .finally(() => { btnSpan.textContent = orig; dBtn.style.pointerEvents = 'auto'; dBtn.style.opacity = '1'; });
        };
        
        downloadBtnsContainer.appendChild(dBtn);
      });
    });

    const cBtn = document.createElement('button');
    cBtn.className = 'btn secondary-btn copy-btn';
    cBtn.innerHTML = `<span class="copy-icon">🔗</span><span id="copy-btn-text">Copy Links</span>`;
    cBtn.onclick = () => {
      navigator.clipboard.writeText(flatUrls.join('\n')).then(() => {
        linkCopiedMsg.style.display = 'block';
        cBtn.querySelector('#copy-btn-text').textContent = 'Copied!';
        setTimeout(() => { linkCopiedMsg.style.display = 'none'; cBtn.querySelector('#copy-btn-text').textContent = 'Copy Links'; }, 3000);
      }).catch(() => alert('Failed to copy link.'));
    };
    downloadBtnsContainer.appendChild(cBtn);

    outputCard.style.display = 'block';
    // Only scroll to it if not currently polling
    // Actually, maybe don't auto scroll since it gets updated incrementally
  };

  // ═══════════════════════════════════════════════════════════
  // 11. RENDER HISTORY (persists in localStorage)
  // ═══════════════════════════════════════════════════════════
  const loadHistory = () => {
    let history = [];
    try { history = JSON.parse(localStorage.getItem('render_history') || '[]'); } catch (e) {}

    // Update log badge count
    if (history.length > 0) {
      logBadge.style.display = 'inline-flex';
      logBadge.textContent = history.length;
    } else {
      logBadge.style.display = 'none';
    }

    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="history-empty">
          <span class="history-empty-icon">📭</span>
          <p>No completed renders yet.</p>
          <p class="helper-small">Completed and failed jobs will appear here with download links.</p>
        </div>`;
      return;
    }

    historyList.innerHTML = '';
    history.slice().reverse().forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';

      const backendUrl = backendUrlInput ? backendUrlInput.value.trim().replace(/\/$/, '') : '';
      
      let flatItemUrls = [];
      const itemOutputs = item.urls || (item.url ? [item.url] : []);
      itemOutputs.forEach(out => {
         if (typeof out === 'object' && out !== null) {
            flatItemUrls = flatItemUrls.concat(out.urls);
         } else {
            flatItemUrls.push(out);
         }
      });
      const fullUrls = flatItemUrls.map(u => backendUrl ? `${backendUrl}${u}` : (window.location.origin + u));

      const statusClass = item.status === 'success' ? 'success' : 'failed';
      const statusLabel = item.status === 'success' ? '✓ Success' : '✗ Failed';

      let actionsHtml = '';
      if (fullUrls.length > 0) {
        actionsHtml = `
          <div class="hist-actions">
            ${fullUrls.map((fu, idx) => `<a href="${fu}" target="_blank" class="btn secondary-btn" style="margin-right: 4px;">View ${fullUrls.length > 1 ? (fu.includes('upscaled') ? 'Upscaled' : 'Normal') : ''}</a>`).join('')}
            <button class="btn secondary-btn hist-copy-btn" data-url="${fullUrls.join('\n')}">Copy</button>
          </div>`;
      }

      div.innerHTML = `
        <div class="hist-info">
          <strong>${new Date(item.timestamp).toLocaleString()}</strong>
          <div class="hist-meta">
            <span class="hist-status ${statusClass}">${statusLabel}</span>
            <span>Job: ${item.jobId}</span>
            ${item.ratio ? `<span>Ratio: ${item.ratio}</span>` : ''}
          </div>
        </div>
        ${actionsHtml}`;

      historyList.appendChild(div);
    });

    // Bind copy buttons
    document.querySelectorAll('.hist-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.url).then(() => {
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = orig, 2000);
        });
      });
    });
  };

  const saveToHistory = (urls, ratio, jobId, status) => {
    let history = [];
    try { history = JSON.parse(localStorage.getItem('render_history') || '[]'); } catch (e) {}

    history.push({
      urls: urls,
      ratio: ratio,
      jobId: jobId,
      status: status,
      timestamp: Date.now()
    });

    localStorage.setItem('render_history', JSON.stringify(history));
    loadHistory();
  };

  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Clear all render history?')) {
      localStorage.removeItem('render_history');
      loadHistory();
    }
  });

  // Initial load
  loadHistory();
});
