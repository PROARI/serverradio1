/**
 * Studio DJ Broadcaster Logic
 * Complete Web Audio broadcast console: mic mixing, auto-ducking,
 * playlist player, procedural soundboard, VU meters, live IP radar, and metadata.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Master Broadcaster UI Elements
  const btnToggleOnAir = document.getElementById('btn-toggle-on-air');
  const lblOnAir = document.getElementById('lbl-on-air');
  const badgeMasterStatus = document.getElementById('badge-master-status');
  const txtMasterStatus = document.getElementById('txt-master-status');
  const txtListenersCount = document.getElementById('txt-listeners-count');
  const broadcastTimer = document.getElementById('broadcast-timer');

  // Master VU Meter
  const vuMasterL = document.getElementById('vu-master-l');
  const vuMasterR = document.getElementById('vu-master-r');
  const lblMasterDb = document.getElementById('lbl-master-db');

  // Mic UI Elements
  const selectMicDevice = document.getElementById('select-mic-device');
  const btnToggleMic = document.getElementById('btn-toggle-mic');
  const btnPushToTalk = document.getElementById('btn-push-to-talk');
  const badgeMicState = document.getElementById('badge-mic-state');
  const sliderMicGain = document.getElementById('slider-mic-gain');
  const lblMicGain = document.getElementById('lbl-mic-gain');
  const chkAutoDucking = document.getElementById('chk-auto-ducking');
  const vuMicLevel = document.getElementById('vu-mic-level');
  const lblMicDb = document.getElementById('lbl-mic-db');

  // Music Deck Elements
  const btnDemoBeat = document.getElementById('btn-demo-beat');
  const deckNowPlaying = document.getElementById('deck-now-playing');
  const btnDeckPlay = document.getElementById('btn-deck-play');
  const btnDeckStop = document.getElementById('btn-deck-stop');
  const sliderMusicVol = document.getElementById('slider-music-vol');
  const lblMusicVol = document.getElementById('lbl-music-vol');
  const dropZone = document.getElementById('drop-zone');
  const fileMusicUpload = document.getElementById('file-music-upload');
  const playlistContainer = document.getElementById('playlist-container');
  const playlistCount = document.getElementById('playlist-count');
  const btnRefreshLibrary = document.getElementById('btn-refresh-library');
  const deckAudio = document.getElementById('deck-audio-element');

  // IP Radar & Telemetry Elements
  const ipRadarTbody = document.getElementById('ip-radar-tbody');
  const badgeTotalIps = document.getElementById('badge-total-ips');
  const studioShoutoutsFeed = document.getElementById('studio-shoutouts-feed');

  // Metadata Form Elements
  const formMetadata = document.getElementById('form-metadata');
  const metaInputStation = document.getElementById('meta-input-station');
  const metaInputShow = document.getElementById('meta-input-show');
  const metaInputDj = document.getElementById('meta-input-dj');
  const metaInputTrack = document.getElementById('meta-input-track');

  // Audio Graph Variables
  let audioCtx = null;
  let masterStreamDest = null;
  let masterGain = null;
  let masterAnalyser = null;

  // Sub-mix gains
  let micGainNode = null;
  let micAnalyser = null;
  let micSourceNode = null;
  let currentMicStream = null;

  let musicGainNode = null;
  let musicDuckingGain = null;
  let deckSourceNode = null;

  let sfxGainNode = null;

  // State
  let isBroadcasting = false;
  let broadcastStartTime = null;
  let timerInterval = null;
  let mediaRecorder = null;
  let broadcastWs = null;

  let isMicActive = false;
  let isPushToTalking = false;
  let isDemoBeatPlaying = false;
  let currentTrackIndex = -1;
  let playlist = [];

  // Init Network HUD as Broadcaster
  window.networkHud.init('broadcaster', 'Estudio Principal');

  window.networkHud.onListenerChange = (count) => {
    if (txtListenersCount) txtListenersCount.textContent = count;
  };

  window.networkHud.onShoutoutReceived = (shoutout) => {
    appendStudioShoutout(shoutout);
  };

  // Internet Status & Tunnel Control in Studio
  const studioInternetText = document.getElementById('studio-internet-text');
  const btnStudioToggleTunnel = document.getElementById('btn-studio-toggle-tunnel');

  function updateStudioInternetUI(internet) {
    if (!studioInternetText || !btnStudioToggleTunnel) return;
    if (internet && internet.isTunnelActive && internet.tunnelUrl) {
      studioInternetText.textContent = 'ACTIVO (MUNDIAL)';
      studioInternetText.style.color = 'var(--accent-green)';
      btnStudioToggleTunnel.textContent = '🛑 Detener Internet';
      btnStudioToggleTunnel.className = 'btn btn-glass btn-sm';
    } else {
      studioInternetText.textContent = internet && internet.publicIp ? `IP: ${internet.publicIp}` : 'DESCONECTADO';
      studioInternetText.style.color = 'var(--text-dim)';
      btnStudioToggleTunnel.textContent = '⚡ Activar Internet';
      btnStudioToggleTunnel.className = 'btn btn-purple btn-sm';
    }
  }

  window.networkHud.onInternetUpdate = (internet) => {
    updateStudioInternetUI(internet);
  };

  btnStudioToggleTunnel?.addEventListener('click', async () => {
    const isCurrentlyActive = studioInternetText.textContent.includes('ACTIVO');
    if (isCurrentlyActive) {
      btnStudioToggleTunnel.textContent = '⏳ Deteniendo...';
      try {
        await fetch('/api/tunnel/stop', { method: 'POST' });
        window.networkHud.showToast('Túnel de internet detenido', 'info');
        await window.networkHud.fetchNetworkInfo();
        updateStudioInternetUI(window.networkHud.networkData?.internet);
      } catch (e) {}
    } else {
      btnStudioToggleTunnel.textContent = '⏳ Iniciando...';
      try {
        const res = await fetch('/api/tunnel/start', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          window.networkHud.showToast('🌍 ¡Transmisión por Internet ACTIVADA!', 'success');
          await window.networkHud.fetchNetworkInfo();
          updateStudioInternetUI(data.internet);
          window.networkHud.renderHeaderHud();
        } else {
          window.networkHud.showToast('Error: ' + data.error, 'danger');
        }
      } catch (e) {
        window.networkHud.showToast('Error activando internet: ' + e.message, 'danger');
      }
    }
  });

  // Setup Web Audio Master Console Graph
  function initAudioEngine() {
    if (audioCtx) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    window.audioSynth.setContext(audioCtx);

    // Master stream destination (will be recorded & broadcasted)
    masterStreamDest = audioCtx.createMediaStreamDestination();

    // Master Gain
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

    // Master Analyser
    masterAnalyser = audioCtx.createAnalyser();
    masterAnalyser.fftSize = 64;

    // Connect Master to Stream Destination & Local Monitoring
    masterGain.connect(masterAnalyser);
    masterAnalyser.connect(masterStreamDest);
    // Also connect to local speakers if desired (at lower level to avoid feedback)
    const monitorGain = audioCtx.createGain();
    monitorGain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    masterGain.connect(monitorGain);
    monitorGain.connect(audioCtx.destination);

    // Sub-Mix 1: Music
    musicGainNode = audioCtx.createGain();
    musicGainNode.gain.setValueAtTime(0.8, audioCtx.currentTime);
    musicDuckingGain = audioCtx.createGain();
    musicDuckingGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

    musicGainNode.connect(musicDuckingGain);
    musicDuckingGain.connect(masterGain);

    // Connect Deck HTML5 Audio
    try {
      deckSourceNode = audioCtx.createMediaElementSource(deckAudio);
      deckSourceNode.connect(musicGainNode);
    } catch (e) {
      console.warn('Deck source init notice:', e);
    }

    // Sub-Mix 2: Microphone
    micGainNode = audioCtx.createGain();
    micGainNode.gain.setValueAtTime(0.0, audioCtx.currentTime); // muted initially
    micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = 64;

    micGainNode.connect(micAnalyser);
    micGainNode.connect(masterGain);

    // Sub-Mix 3: SFX / Soundboard
    sfxGainNode = audioCtx.createGain();
    sfxGainNode.gain.setValueAtTime(0.9, audioCtx.currentTime);
    sfxGainNode.connect(masterGain);

    // Start VU meter update loop
    startVuMeterLoop();
  }

  // Enumerate & Load Microphone Devices
  async function loadMicDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');

      selectMicDevice.innerHTML = '';
      if (audioInputs.length === 0) {
        selectMicDevice.innerHTML = '<option value="">No se encontraron micrófonos</option>';
        return;
      }

      audioInputs.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = dev.label || `Micrófono ${idx + 1}`;
        selectMicDevice.appendChild(opt);
      });
    } catch (e) {
      selectMicDevice.innerHTML = '<option value="">Permiso de micrófono no otorgado</option>';
    }
  }

  // Setup Microphone Stream
  async function setupMicStream(deviceId = null) {
    initAudioEngine();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (currentMicStream) {
      currentMicStream.getTracks().forEach(t => t.stop());
    }

    const constraints = {
      audio: deviceId ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } : true
    };

    try {
      currentMicStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (micSourceNode) micSourceNode.disconnect();

      micSourceNode = audioCtx.createMediaStreamSource(currentMicStream);
      micSourceNode.connect(micGainNode);
      loadMicDevices(); // update labels now that permission is given
      window.networkHud.showToast('🎙️ Micrófono conectado correctamente', 'success');
    } catch (err) {
      window.networkHud.showToast('No se pudo acceder al micrófono: ' + err.message, 'danger');
    }
  }

  selectMicDevice.addEventListener('change', () => {
    setupMicStream(selectMicDevice.value);
  });

  // Toggle Mic ON / MUTE
  function setMicActive(active) {
    initAudioEngine();
    isMicActive = active;

    const gainVal = active ? parseFloat(sliderMicGain.value) : 0.0;
    const now = audioCtx.currentTime;
    micGainNode.gain.cancelScheduledValues(now);
    micGainNode.gain.linearRampToValueAtTime(gainVal, now + 0.08);

    if (active) {
      btnToggleMic.classList.add('btn-cyan');
      btnToggleMic.classList.remove('btn-glass');
      btnToggleMic.textContent = '🔴 Mic Activo';
      badgeMicState.className = 'badge badge-live';
      badgeMicState.textContent = 'AL AIRE';

      // Apply Auto-Ducking on Music
      if (chkAutoDucking.checked && musicDuckingGain) {
        musicDuckingGain.gain.cancelScheduledValues(now);
        musicDuckingGain.gain.linearRampToValueAtTime(0.25, now + 0.15);
      }
    } else {
      btnToggleMic.classList.remove('btn-cyan');
      btnToggleMic.classList.add('btn-glass');
      btnToggleMic.textContent = '🎤 Abrir Mic';
      badgeMicState.className = 'badge badge-off';
      badgeMicState.textContent = 'SILENCIADO';

      // Restore Music volume smoothly
      if (musicDuckingGain) {
        musicDuckingGain.gain.cancelScheduledValues(now);
        musicDuckingGain.gain.linearRampToValueAtTime(1.0, now + 0.35);
      }
    }
  }

  btnToggleMic.addEventListener('click', () => {
    if (!currentMicStream) {
      setupMicStream().then(() => setMicActive(!isMicActive));
    } else {
      setMicActive(!isMicActive);
    }
  });

  // Push to Talk
  btnPushToTalk.addEventListener('mousedown', () => {
    isPushToTalking = true;
    if (!currentMicStream) setupMicStream().then(() => setMicActive(true));
    else setMicActive(true);
  });
  btnPushToTalk.addEventListener('mouseup', () => {
    if (isPushToTalking) {
      isPushToTalking = false;
      setMicActive(false);
    }
  });
  btnPushToTalk.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isPushToTalking = true;
    if (!currentMicStream) setupMicStream().then(() => setMicActive(true));
    else setMicActive(true);
  });
  btnPushToTalk.addEventListener('touchend', () => {
    if (isPushToTalking) {
      isPushToTalking = false;
      setMicActive(false);
    }
  });

  sliderMicGain.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    lblMicGain.textContent = `${Math.round(val * 100)}%`;
    if (isMicActive && micGainNode) {
      micGainNode.gain.setValueAtTime(val, audioCtx.currentTime);
    }
  });

  // ==========================================
  // MASTER BROADCAST (ON AIR)
  // ==========================================
  btnToggleOnAir.addEventListener('click', () => {
    if (isBroadcasting) {
      stopBroadcasting();
    } else {
      startBroadcasting();
    }
  });

  async function startBroadcasting() {
    initAudioEngine();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    // Check recorder support
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';
    }

    try {
      const options = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : {};
      mediaRecorder = new MediaRecorder(masterStreamDest.stream, options);
    } catch (e) {
      return window.networkHud.showToast('Error creando grabador de audio: ' + e.message, 'danger');
    }

    // Connect WebSocket broadcaster
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/audio?mode=broadcast`;
    broadcastWs = new WebSocket(wsUrl);

    broadcastWs.onopen = () => {
      isBroadcasting = true;
      btnToggleOnAir.classList.add('is-live');
      lblOnAir.textContent = 'DETENER EMISIÓN';
      badgeMasterStatus.className = 'badge badge-live';
      txtMasterStatus.textContent = 'AL AIRE';

      broadcastStartTime = Date.now();
      timerInterval = setInterval(updateTimerDisplay, 1000);

      // Start recording with 300ms chunks for responsive streaming
      mediaRecorder.start(300);

      window.networkHud.showToast('🚀 ¡Estás TRANSMITIENDO EN VIVO al aire!', 'success');
    };

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0 && broadcastWs && broadcastWs.readyState === WebSocket.OPEN) {
        broadcastWs.send(event.data);
      }
    };

    broadcastWs.onerror = (e) => {
      window.networkHud.showToast('Error en la conexión del broadcast', 'danger');
    };

    broadcastWs.onclose = () => {
      if (isBroadcasting) stopBroadcasting();
    };
  }

  function stopBroadcasting() {
    isBroadcasting = false;
    btnToggleOnAir.classList.remove('is-live');
    lblOnAir.textContent = 'INICIAR TRANSMISIÓN';
    badgeMasterStatus.className = 'badge badge-off';
    txtMasterStatus.textContent = 'FUERA DEL AIRE';

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    broadcastTimer.textContent = '00:00:00';

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (broadcastWs) {
      broadcastWs.close();
      broadcastWs = null;
    }

    window.networkHud.showToast('Emisión detenida', 'info');
  }

  function updateTimerDisplay() {
    if (!broadcastStartTime) return;
    const diff = Math.floor((Date.now() - broadcastStartTime) / 1000);
    const hrs = String(Math.floor(diff / 3600)).padStart(2, '0');
    const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const secs = String(diff % 60).padStart(2, '0');
    broadcastTimer.textContent = `${hrs}:${mins}:${secs}`;
  }

  // ==========================================
  // VU METER ANIMATION LOOP
  // ==========================================
  function startVuMeterLoop() {
    const masterData = new Uint8Array(32);
    const micData = new Uint8Array(32);

    function update() {
      requestAnimationFrame(update);

      // Master VU
      if (masterAnalyser) {
        masterAnalyser.getByteFrequencyData(masterData);
        let sum = 0;
        for (let i = 0; i < masterData.length; i++) sum += masterData[i];
        const avg = sum / masterData.length;
        const pct = Math.min(100, Math.round((avg / 200) * 100));

        vuMasterL.style.width = `${pct}%`;
        vuMasterR.style.width = `${Math.max(0, pct - 2 + Math.floor(Math.random() * 4))}%`;

        if (pct > 0) {
          const db = Math.round((pct / 100) * 60 - 60);
          lblMasterDb.textContent = `${db} dB`;
        } else {
          lblMasterDb.textContent = '-inf dB';
        }
      }

      // Mic VU
      if (micAnalyser && isMicActive) {
        micAnalyser.getByteFrequencyData(micData);
        let mSum = 0;
        for (let i = 0; i < micData.length; i++) mSum += micData[i];
        const mAvg = mSum / micData.length;
        const mPct = Math.min(100, Math.round((mAvg / 180) * 100));

        vuMicLevel.style.width = `${mPct}%`;
        if (mPct > 0) {
          const db = Math.round((mPct / 100) * 50 - 50);
          lblMicDb.textContent = `${db} dB`;
        } else {
          lblMicDb.textContent = '-inf dB';
        }
      } else {
        vuMicLevel.style.width = '0%';
        lblMicDb.textContent = '-inf dB';
      }
    }

    update();
  }

  // ==========================================
  // MUSIC DECK & PLAYLIST
  // ==========================================
  btnDeckPlay.addEventListener('click', () => {
    initAudioEngine();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (deckAudio.paused) {
      if (!deckAudio.src && playlist.length > 0) {
        playTrack(0);
      } else {
        deckAudio.play();
        btnDeckPlay.textContent = '❚❚ Pausa';
      }
    } else {
      deckAudio.pause();
      btnDeckPlay.textContent = '▶ Play';
    }
  });

  btnDeckStop.addEventListener('click', () => {
    deckAudio.pause();
    deckAudio.currentTime = 0;
    btnDeckPlay.textContent = '▶ Play';
    if (isDemoBeatPlaying) stopDemoBeat();
  });

  sliderMusicVol.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    lblMusicVol.textContent = `${Math.round(val * 100)}%`;
    if (musicGainNode) musicGainNode.gain.setValueAtTime(val, audioCtx.currentTime);
  });

  // Procedural Demo Beat
  btnDemoBeat.addEventListener('click', () => {
    initAudioEngine();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (isDemoBeatPlaying) {
      stopDemoBeat();
    } else {
      startDemoBeat();
    }
  });

  function startDemoBeat() {
    isDemoBeatPlaying = true;
    btnDemoBeat.classList.remove('btn-purple');
    btnDemoBeat.classList.add('btn-danger');
    btnDemoBeat.textContent = '⏹ Detener Beat';
    deckNowPlaying.textContent = '⚡ Beat Demo de Radio (Sintetizador en Vivo)';
    metaInputTrack.value = 'Beat Sintetizado Radio';

    // Route demo music through musicGainNode
    window.audioSynth.startDemoMusic(musicGainNode);
    window.networkHud.showToast('🎵 Reproduciendo Beat Sintetizado en Vivo', 'purple');
  }

  function stopDemoBeat() {
    isDemoBeatPlaying = false;
    btnDemoBeat.classList.add('btn-purple');
    btnDemoBeat.classList.remove('btn-danger');
    btnDemoBeat.textContent = '⚡ Beat Demo Sintetizado';
    window.audioSynth.stopDemoMusic();
    deckNowPlaying.textContent = 'Ninguna pista seleccionada';
  }

  // Load Playlist from Server Library
  async function loadLibrary() {
    try {
      const res = await fetch('/api/library');
      if (res.ok) {
        const data = await res.json();
        playlist = data.songs || [];
        renderPlaylist();
      }
    } catch (e) {
      console.warn('Error cargando biblioteca:', e);
    }
  }

  function renderPlaylist() {
    playlistCount.textContent = playlist.length;
    if (playlist.length === 0) {
      playlistContainer.innerHTML = `
        <div style="color: var(--text-dim); font-size: 0.8rem; text-align: center; padding: 1.5rem;">
          Carga canciones o usa el Beat Demo para comenzar
        </div>`;
      return;
    }

    playlistContainer.innerHTML = playlist.map((song, idx) => `
      <div class="playlist-item ${currentTrackIndex === idx ? 'active' : ''}">
        <div class="playlist-item-left">
          <button class="btn btn-glass btn-sm" onclick="window.studioPlayTrack(${idx})" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">
            ${currentTrackIndex === idx && !deckAudio.paused ? '❚❚' : '▶'}
          </button>
          <div>
            <div style="font-weight: 600; color: #fff;">${escapeHtml(song.displayName)}</div>
            <div style="font-size: 0.7rem; color: var(--text-dim);">${song.sizeMb} MB</div>
          </div>
        </div>
        <button class="btn btn-glass btn-sm" onclick="window.studioDeleteTrack('${encodeURIComponent(song.filename)}')" style="padding: 0.2rem 0.4rem; color: var(--accent-red);">
          🗑️
        </button>
      </div>
    `).join('');
  }

  window.studioPlayTrack = (index) => {
    initAudioEngine();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playTrack(index);
  };

  function playTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    const song = playlist[index];

    if (isDemoBeatPlaying) stopDemoBeat();

    deckAudio.src = song.url;
    deckAudio.play().then(() => {
      btnDeckPlay.textContent = '❚❚ Pausa';
      deckNowPlaying.textContent = `🎵 ${song.displayName}`;
      metaInputTrack.value = song.displayName;
      renderPlaylist();
      // Auto-update metadata to listeners
      pushMetadataToServer();
    }).catch(err => {
      console.warn('Error reproduciendo pista:', err);
    });
  }

  deckAudio.addEventListener('ended', () => {
    if (currentTrackIndex + 1 < playlist.length) {
      playTrack(currentTrackIndex + 1);
    } else {
      playTrack(0); // loop
    }
  });

  window.studioDeleteTrack = async (filename) => {
    if (!confirm('¿Eliminar esta canción de la biblioteca?')) return;
    try {
      const res = await fetch(`/api/library/${filename}`, { method: 'DELETE' });
      if (res.ok) {
        window.networkHud.showToast('Canción eliminada', 'info');
        loadLibrary();
      }
    } catch (e) {
      window.networkHud.showToast('Error eliminando canción', 'danger');
    }
  };

  btnRefreshLibrary.addEventListener('click', loadLibrary);

  // File Upload Handlers
  dropZone.addEventListener('click', () => fileMusicUpload.click());

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
      uploadFiles(e.dataTransfer.files);
    }
  });

  fileMusicUpload.addEventListener('change', () => {
    if (fileMusicUpload.files.length > 0) {
      uploadFiles(fileMusicUpload.files);
    }
  });

  async function uploadFiles(files) {
    for (const file of files) {
      const formData = new FormData();
      formData.append('audio', file);
      window.networkHud.showToast(`Subiendo ${file.name}...`, 'info');

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        if (res.ok) {
          window.networkHud.showToast(`✅ ${file.name} subida a la radio`, 'success');
        } else {
          window.networkHud.showToast(`Error subiendo ${file.name}`, 'danger');
        }
      } catch (err) {
        window.networkHud.showToast(`Error: ${err.message}`, 'danger');
      }
    }
    loadLibrary();
  }

  // ==========================================
  // SOUNDBOARD PADS
  // ==========================================
  document.querySelectorAll('.sfx-pad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      initAudioEngine();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const sfx = btn.getAttribute('data-sfx');

      switch (sfx) {
        case 'airhorn':
          window.audioSynth.playAirhorn(sfxGainNode);
          break;
        case 'applause':
          window.audioSynth.playApplause(sfxGainNode);
          break;
        case 'scratch':
          window.audioSynth.playVinylScratch(sfxGainNode);
          break;
        case 'jingle':
          window.audioSynth.playRadioJingle(sfxGainNode);
          break;
        case 'laser':
          window.audioSynth.playLaserSweep(sfxGainNode);
          break;
        case 'censor':
          window.audioSynth.playCensorBeep(sfxGainNode);
          break;
      }
    });
  });

  // ==========================================
  // LIVE IP RADAR TABLE REFRESH
  // ==========================================
  async function refreshIpRadar() {
    try {
      const res = await fetch('/api/ips');
      if (res.ok) {
        const data = await res.json();
        badgeTotalIps.textContent = `${data.activeCount} Activas`;

        if (!data.activeClients || data.activeClients.length === 0) {
          ipRadarTbody.innerHTML = `
            <tr>
              <td colspan="3" style="text-align: center; color: var(--text-dim); padding: 1.5rem;">
                Esperando oyentes...
              </td>
            </tr>`;
          return;
        }

        ipRadarTbody.innerHTML = data.activeClients.map(c => `
          <tr>
            <td>
              <div style="font-weight: 700; color: #fff; font-family: var(--font-mono); font-size: 0.85rem;">
                ${c.ip}
              </div>
              <div style="font-size: 0.7rem; color: var(--text-dim);">
                ${c.alias ? `🏷️ ${escapeHtml(c.alias)}` : c.role === 'broadcaster' ? '🎙️ Locutor' : '🎧 Oyente'}
              </div>
            </td>
            <td>
              <span class="badge ${c.category.includes('LAN') ? 'badge-lan' : c.category.includes('Este') ? 'badge-local' : 'badge-wan'}" style="font-size: 0.68rem;">
                ${c.category}
              </span>
            </td>
            <td>
              <div style="font-size: 0.8rem; color: #fff;">${c.device}</div>
              <div style="font-size: 0.7rem; color: var(--text-dim);">${c.os}</div>
            </td>
          </tr>
        `).join('');
      }
    } catch (e) {}
  }

  setInterval(refreshIpRadar, 4000);
  refreshIpRadar();

  // ==========================================
  // METADATA FORM UPDATE
  // ==========================================
  formMetadata.addEventListener('submit', (e) => {
    e.preventDefault();
    pushMetadataToServer();
  });

  async function pushMetadataToServer() {
    const payload = {
      stationName: metaInputStation.value.trim(),
      showName: metaInputShow.value.trim(),
      djName: metaInputDj.value.trim(),
      title: metaInputTrack.value.trim()
    };

    try {
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        window.networkHud.showToast('✅ Información de radio actualizada en vivo', 'success');
      }
    } catch (e) {
      window.networkHud.showToast('Error actualizando información', 'danger');
    }
  }

  // ==========================================
  // SALUDOS IN STUDIO
  // ==========================================
  function appendStudioShoutout(s) {
    if (!studioShoutoutsFeed) return;
    const noMsg = studioShoutoutsFeed.querySelector('div[style*="text-align: center"]');
    if (noMsg) noMsg.remove();

    const div = document.createElement('div');
    div.style.cssText = 'background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 0.6rem; font-size: 0.8rem;';
    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 0.2rem;">
        <span style="font-weight: 700; color: var(--accent-purple);">👤 ${escapeHtml(s.name)} <span class="mono" style="color: var(--accent-cyan);">(${s.ip})</span></span>
        <span class="mono text-muted">${s.timestamp}</span>
      </div>
      <div style="color: #fff;">"${escapeHtml(s.message)}"</div>
    `;

    studioShoutoutsFeed.prepend(div);
  }

  // Fetch initial shoutouts
  fetch('/api/shoutouts')
    .then(r => r.json())
    .then(data => {
      if (data.shoutouts && data.shoutouts.length > 0) {
        studioShoutoutsFeed.innerHTML = '';
        data.shoutouts.forEach(s => appendStudioShoutout(s));
      }
    })
    .catch(() => {});

  // Initial setup
  loadMicDevices();
  loadLibrary();

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }
});
