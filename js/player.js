/**
 * Listener Player Client Logic
 * Dual-engine audio player (MediaSource WebSocket stream + HTML5 Audio /stream fallback),
 * circular frequency visualizer, live metadata updates, and shoutout chat.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const btnMasterPlay = document.getElementById('btn-master-play');
  const playerContainer = document.getElementById('player-container');
  const playerStatusHint = document.getElementById('player-status-hint');
  const volSlider = document.getElementById('vol-slider');
  const volPercent = document.getElementById('vol-percent');
  const btnMute = document.getElementById('btn-mute');
  const selectStreamMode = document.getElementById('select-stream-mode');
  const nativeAudio = document.getElementById('native-audio-player');
  const visualizerCanvas = document.getElementById('visualizer-canvas');
  const discIcon = document.getElementById('disc-icon');

  // Metadata Elements
  const metaStationName = document.getElementById('meta-station-name');
  const metaShowName = document.getElementById('meta-show-name');
  const metaDjName = document.getElementById('meta-dj-name');
  const metaTrackTitle = document.getElementById('meta-track-title');
  const badgeLiveStatus = document.getElementById('badge-live-status');
  const txtLiveStatus = document.getElementById('txt-live-status');
  const txtListenersCount = document.getElementById('txt-listeners-count');

  // Diagnostic Stats Elements
  const statClientIp = document.getElementById('stat-client-ip');
  const statClientNetwork = document.getElementById('stat-client-network');
  const statClientDevice = document.getElementById('stat-client-device');
  const statClientPing = document.getElementById('stat-client-ping');

  // Shoutouts Elements
  const shoutoutsFeed = document.getElementById('shoutouts-feed');
  const shoutoutForm = document.getElementById('shoutout-form');
  const shoutoutNameInput = document.getElementById('shoutout-name');
  const shoutoutMessageInput = document.getElementById('shoutout-message');

  // State
  let isPlaying = false;
  let audioContext = null;
  let analyser = null;
  let sourceNode = null;
  let mediaSource = null;
  let sourceBuffer = null;
  let audioWs = null;
  let animFrameId = null;
  let lastVolume = 0.85;

  // Initialize Network HUD
  window.networkHud.init('listener');

  // Hook Network HUD callbacks
  window.networkHud.onStationUpdate = (station) => {
    updateStationUI(station);
  };

  window.networkHud.onListenerChange = (count) => {
    if (txtListenersCount) txtListenersCount.textContent = count;
  };

  window.networkHud.onShoutoutReceived = (shoutout) => {
    appendShoutout(shoutout);
  };

  // Populate diagnostics when network data is ready
  setTimeout(() => {
    if (window.networkHud.networkData) {
      const c = window.networkHud.networkData.client;
      if (statClientIp) statClientIp.textContent = c.ip;
      if (statClientNetwork) statClientNetwork.textContent = c.category;

      const ua = navigator.userAgent;
      let dev = 'Ordenador (PC)';
      if (/iphone|ipad|ipod/i.test(ua)) dev = 'Apple iOS';
      else if (/android/i.test(ua)) dev = 'Android';
      else if (/macintosh/i.test(ua)) dev = 'Mac OS';
      if (statClientDevice) statClientDevice.textContent = dev;
    }
  }, 400);

  // Measure ping periodically
  setInterval(() => {
    if (window.networkHud.telemetryWs && window.networkHud.telemetryWs.readyState === WebSocket.OPEN) {
      const start = performance.now();
      const onPong = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          if (d.type === 'pong') {
            const rtt = Math.round(performance.now() - start);
            if (statClientPing) statClientPing.textContent = `${rtt} ms`;
            window.networkHud.telemetryWs.removeEventListener('message', onPong);
          }
        } catch (e) {}
      };
      window.networkHud.telemetryWs.addEventListener('message', onPong);
      window.networkHud.telemetryWs.send(JSON.stringify({ type: 'ping' }));
    }
  }, 8000);

  // Setup Web Audio Context and Analyser
  function initAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;

      try {
        sourceNode = audioContext.createMediaElementSource(nativeAudio);
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);
      } catch (e) {
        console.warn('Audio node connection notice:', e);
      }
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }

  // Visualizer Animation
  function startVisualizer() {
    if (!visualizerCanvas) return;
    const ctx = visualizerCanvas.getContext('2d');
    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 108;

    const bufferLength = analyser ? analyser.frequencyBinCount : 32;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      animFrameId = requestAnimationFrame(draw);

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        // Subtle resting wave
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.sin(Date.now() / 300 + i * 0.3) * 10 + 12;
        }
      }

      ctx.clearRect(0, 0, width, height);

      // Draw radial frequency bars
      const numBars = 48;
      const angleStep = (Math.PI * 2) / numBars;

      for (let i = 0; i < numBars; i++) {
        const val = dataArray[i % bufferLength] || 0;
        const barHeight = (val / 255) * 35;
        const angle = i * angleStep;

        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + barHeight + 2);
        const y2 = centerY + Math.sin(angle) * (radius + barHeight + 2);

        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, '#00f0ff');
        gradient.addColorStop(0.5, '#b026ff');
        gradient.addColorStop(1, '#ff2a55');

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = gradient;
        ctx.stroke();
      }
    }

    draw();
  }

  // Play / Stop Master Switch
  btnMasterPlay.addEventListener('click', () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  });

  function startPlayback() {
    initAudioContext();
    const mode = selectStreamMode ? selectStreamMode.value : 'ws';

    if (mode === 'http') {
      startHttpPlayback();
    } else {
      startWsPlayback();
    }
  }

  function startHttpPlayback() {
    nativeAudio.src = `/stream?t=${Date.now()}`;
    nativeAudio.volume = parseFloat(volSlider.value);

    playerStatusHint.textContent = 'Conectando al flujo HTTP...';

    nativeAudio.play().then(() => {
      onPlaySuccess();
    }).catch((err) => {
      console.warn('Error iniciando reproducción HTTP:', err);
      playerStatusHint.textContent = 'Esperando señal del estudio...';
      // Attempt retry after 2s
      setTimeout(() => {
        if (!isPlaying) nativeAudio.play().then(onPlaySuccess).catch(() => {});
      }, 2000);
    });
  }

  function startWsPlayback() {
    // Check MediaSource support
    if (!window.MediaSource) {
      console.log('MediaSource no soportado, cambiando a modo HTTP.');
      return startHttpPlayback();
    }

    mediaSource = new MediaSource();
    nativeAudio.src = URL.createObjectURL(mediaSource);
    nativeAudio.volume = parseFloat(volSlider.value);

    playerStatusHint.textContent = 'Sintonizando transmisión de baja latencia...';

    mediaSource.addEventListener('sourceopen', () => {
      const mime = 'audio/webm; codecs=opus';
      if (!MediaSource.isTypeSupported(mime)) {
        console.warn('MIME no soportado directamente, usando fallback HTTP');
        return startHttpPlayback();
      }

      try {
        sourceBuffer = mediaSource.addSourceBuffer(mime);
        sourceBuffer.mode = 'sequence';

        const queue = [];
        let isUpdating = false;

        function appendNext() {
          if (queue.length > 0 && !isUpdating && sourceBuffer && !sourceBuffer.updating) {
            isUpdating = true;
            try {
              const chunk = queue.shift();
              sourceBuffer.appendBuffer(chunk);
            } catch (e) {
              console.warn('Error anexando chunk de audio:', e);
              isUpdating = false;
            }
          }
        }

        sourceBuffer.addEventListener('updateend', () => {
          isUpdating = false;
          appendNext();
        });

        // Open audio WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/audio?mode=listen`;
        audioWs = new WebSocket(wsUrl);
        audioWs.binaryType = 'arraybuffer';

        audioWs.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            queue.push(event.data);
            appendNext();
          }
        };

        audioWs.onclose = () => {
          if (isPlaying) {
            playerStatusHint.textContent = 'Estudio pausado o reconectando...';
          }
        };

        nativeAudio.play().then(() => {
          onPlaySuccess();
        }).catch(() => {
          // User interaction requirement
        });

      } catch (err) {
        console.warn('Fallo al iniciar MediaSource:', err);
        startHttpPlayback();
      }
    });
  }

  function onPlaySuccess() {
    isPlaying = true;
    btnMasterPlay.classList.add('playing');
    btnMasterPlay.innerHTML = '❚❚';
    playerContainer.classList.add('player-playing');
    discIcon.style.animation = 'spin-glow 4s linear infinite';
    playerStatusHint.textContent = 'Sintonizado • Transmisión activa';
    startVisualizer();
  }

  function stopPlayback() {
    isPlaying = false;
    btnMasterPlay.classList.remove('playing');
    btnMasterPlay.innerHTML = '▶';
    playerContainer.classList.remove('player-playing');
    discIcon.style.animation = 'none';
    playerStatusHint.textContent = 'Transmisión en pausa';

    nativeAudio.pause();
    nativeAudio.src = '';

    if (audioWs) {
      audioWs.close();
      audioWs = null;
    }
  }

  // Volume Controls
  volSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    nativeAudio.volume = val;
    volPercent.textContent = `${Math.round(val * 100)}%`;
    btnMute.textContent = val === 0 ? '🔇' : val < 0.5 ? '🔉' : '🔊';
  });

  btnMute.addEventListener('click', () => {
    if (nativeAudio.volume > 0) {
      lastVolume = nativeAudio.volume;
      nativeAudio.volume = 0;
      volSlider.value = 0;
      volPercent.textContent = '0%';
      btnMute.textContent = '🔇';
    } else {
      nativeAudio.volume = lastVolume || 0.85;
      volSlider.value = nativeAudio.volume;
      volPercent.textContent = `${Math.round(nativeAudio.volume * 100)}%`;
      btnMute.textContent = '🔊';
    }
  });

  // Station Metadata Update
  function updateStationUI(station) {
    if (!station) return;

    if (metaStationName && station.stationName) metaStationName.textContent = station.stationName;
    if (metaShowName && station.showName) metaShowName.textContent = station.showName;
    if (metaDjName && station.djName) metaDjName.textContent = station.djName;

    if (metaTrackTitle && station.currentSong) {
      const song = station.currentSong;
      metaTrackTitle.textContent = `${song.artist || 'Radio'} — ${song.title || 'En Vivo'}`;
    }

    if (badgeLiveStatus && txtLiveStatus) {
      if (station.isBroadcasting) {
        badgeLiveStatus.className = 'badge badge-live';
        txtLiveStatus.textContent = 'EN VIVO';
        if (!isPlaying) {
          playerStatusHint.textContent = '¡Estudio transmitiendo en vivo! Presiona ▶';
        }
      } else {
        badgeLiveStatus.className = 'badge badge-off';
        txtLiveStatus.textContent = 'EN ESPERA';
      }
    }
  }

  // Shoutouts / Saludos
  function appendShoutout(item) {
    if (!shoutoutsFeed) return;

    const noMsg = shoutoutsFeed.querySelector('div[style*="text-align: center"]');
    if (noMsg) noMsg.remove();

    const div = document.createElement('div');
    div.className = 'shoutout-item';
    div.innerHTML = `
      <div class="shoutout-meta">
        <span class="shoutout-author">👤 ${escapeHtml(item.name)} <span class="mono" style="font-size: 0.7rem; color: var(--accent-cyan);">(${item.ip})</span></span>
        <span class="mono">${item.timestamp}</span>
      </div>
      <div style="color: #fff; word-break: break-word;">${escapeHtml(item.message)}</div>
    `;

    shoutoutsFeed.prepend(div);
  }

  shoutoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = shoutoutNameInput.value.trim();
    const message = shoutoutMessageInput.value.trim();
    if (!message) return;

    try {
      const res = await fetch('/api/shoutouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, message })
      });

      if (res.ok) {
        shoutoutMessageInput.value = '';
        window.networkHud.showToast('✅ ¡Tu saludo fue enviado al estudio!', 'success');
      }
    } catch (err) {
      window.networkHud.showToast('Error enviando mensaje al estudio', 'danger');
    }
  });

  // Fetch initial shoutouts
  fetch('/api/shoutouts')
    .then(r => r.json())
    .then(data => {
      if (data.shoutouts && data.shoutouts.length > 0) {
        shoutoutsFeed.innerHTML = '';
        data.shoutouts.forEach(s => appendShoutout(s));
      }
    })
    .catch(() => {});

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  // Initial dummy visualizer loop
  startVisualizer();
});
