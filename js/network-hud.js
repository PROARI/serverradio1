/**
 * Network HUD & IP Discovery System
 * Detects local IP, Public IP, manages the Internet Tunnel (localtunnel),
 * renders QR codes for both local Wi-Fi and global Internet access.
 */

class NetworkHUD {
  constructor() {
    this.networkData = null;
    this.telemetryWs = null;
    this.clientRole = 'listener';
    this.clientName = '';
    this.onStationUpdate = null;
    this.onListenerChange = null;
    this.onShoutoutReceived = null;
    this.onInternetUpdate = null;
  }

  async init(role = 'listener', name = '') {
    this.clientRole = role;
    this.clientName = name;
    await this.fetchNetworkInfo();
    this.renderHeaderHud();
    this.initTelemetry();
  }

  async fetchNetworkInfo() {
    try {
      const res = await fetch('/api/network-info');
      if (res.ok) {
        this.networkData = await res.json();
      }
    } catch (e) {
      console.warn('No se pudo obtener información de red:', e);
    }
  }

  renderHeaderHud() {
    const banner = document.getElementById('ip-hud-banner');
    if (!banner || !this.networkData) return;

    const client = this.networkData.client || { ip: '127.0.0.1', type: 'Localhost', label: 'Este Equipo' };
    const primaryInterface = this.networkData.interfaces?.find(i => !i.isLoopback) || this.networkData.interfaces?.[0];
    const internet = this.networkData.internet || {};

    banner.innerHTML = `
      <div class="ip-banner-left">
        <span class="ip-pill">
          <span>📡 Tu IP:</span>
          <b>${client.ip}</b>
          <span class="badge ${client.badge || 'badge-lan'}">${client.label}</span>
        </span>

        ${primaryInterface ? `
        <span class="ip-pill">
          <span>🏠 Wi-Fi / LAN:</span>
          <b class="text-cyan">${primaryInterface.ip}:${this.networkData.port}</b>
        </span>` : ''}

        ${internet.isTunnelActive ? `
        <span class="ip-pill" style="border-color: var(--accent-green);">
          <span>🌍 Internet Mundial:</span>
          <b style="color: var(--accent-green);">${internet.tunnelUrl}</b>
          <span class="badge badge-live" style="font-size: 0.65rem; padding: 0.15rem 0.45rem;">PÚBLICO</span>
        </span>` : `
        <span class="ip-pill">
          <span>🌐 IP Pública:</span>
          <b class="text-cyan">${internet.publicIp || 'Detectando...'}</b>
        </span>`}
      </div>

      <div class="ip-banner-right">
        ${!internet.isTunnelActive ? `
        <button id="btn-toggle-internet" class="btn btn-purple btn-sm">
          🌍 Activar Acceso Internet
        </button>` : `
        <button id="btn-copy-internet-url" class="btn btn-cyan btn-sm">
          📋 Copiar Enlace Internet
        </button>`}

        <button id="btn-show-qr" class="btn btn-glass btn-sm">
          📱 Códigos QR
        </button>
      </div>
    `;

    document.getElementById('btn-show-qr')?.addEventListener('click', () => {
      this.showQrModal();
    });

    document.getElementById('btn-copy-internet-url')?.addEventListener('click', () => {
      if (internet.tunnelUrl) {
        navigator.clipboard.writeText(internet.tunnelUrl).then(() => {
          this.showToast('✅ ¡Enlace de Internet copiado! Compártelo con quien quieras fuera de tu casa.', 'success');
        });
      }
    });

    document.getElementById('btn-toggle-internet')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-toggle-internet');
      if (btn) btn.textContent = '⏳ Conectando Túnel...';
      try {
        const res = await fetch('/api/tunnel/start', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          this.showToast('🌍 ¡Túnel de Internet activado con éxito!', 'success');
          await this.fetchNetworkInfo();
          this.renderHeaderHud();
        } else {
          this.showToast('No se pudo activar el túnel: ' + (data.error || ''), 'danger');
        }
      } catch (err) {
        this.showToast('Error conectando a internet: ' + err.message, 'danger');
      }
    });
  }

  showQrModal() {
    let modal = document.getElementById('qr-share-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'qr-share-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    if (!this.networkData) return;

    const internet = this.networkData.internet || {};
    const primaryInterface = this.networkData.interfaces?.find(i => !i.isLoopback);

    // Internet Card HTML
    const internetCardHtml = internet.isTunnelActive && internet.tunnelQr ? `
      <div style="grid-column: 1 / -1; background: linear-gradient(135deg, rgba(0, 255, 136, 0.12), rgba(0, 240, 255, 0.08)); border: 2px solid var(--accent-green); border-radius: var(--radius-md); padding: 1.5rem; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.85rem; box-shadow: 0 0 25px rgba(0,255,136,0.2);">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1.3rem;">🌍</span>
          <span style="font-weight: 800; font-size: 1.05rem; color: var(--accent-green);">ACCESO GLOBAL POR INTERNET (Cualquier Lugar del Mundo)</span>
        </div>
        <p style="font-size: 0.82rem; color: var(--text-muted); max-width: 450px;">
          Escanea este código con cualquier teléfono usando <b>datos móviles (4G/5G)</b> o desde cualquier país fuera de tu red local:
        </p>
        <div style="background: #0d1117; padding: 12px; border-radius: 12px; border: 1px solid var(--accent-green); display: inline-block;">
          <img src="${internet.tunnelQr}" alt="QR Internet" style="width: 190px; height: 190px; display: block; border-radius: 6px;" />
        </div>
        <div style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: 700; color: #fff; word-break: break-all;">
          ${internet.tunnelUrl}
        </div>
        <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; justify-content: center;">
          <button class="btn btn-cyan btn-sm" onclick="navigator.clipboard.writeText('${internet.tunnelUrl}'); window.networkHud.showToast('Enlace de oyente de Internet copiado', 'success');">
            📋 Copiar Enlace Oyente
          </button>
          <button class="btn btn-purple btn-sm" onclick="navigator.clipboard.writeText('${internet.tunnelStudioUrl}'); window.networkHud.showToast('Enlace de estudio de Internet copiado', 'success');">
            🎙️ Copiar Enlace Estudio
          </button>
        </div>
      </div>
    ` : `
      <div style="grid-column: 1 / -1; background: rgba(176, 38, 255, 0.08); border: 1px dashed var(--accent-purple); border-radius: var(--radius-md); padding: 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
        <div>
          <div style="font-weight: 700; color: #fff; margin-bottom: 0.25rem;">🌍 ¿Quieres transmitir a oyentes fuera de tu red local?</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Activa el túnel seguro de internet para generar un enlace HTTPS público con 1 clic.</div>
        </div>
        <button id="btn-modal-start-tunnel" class="btn btn-purple btn-sm" onclick="window.networkHud.triggerStartTunnel()">
          🚀 Activar Transmisión por Internet
        </button>
      </div>
    `;

    // Local Wi-Fi interfaces HTML
    const interfacesHtml = (this.networkData.interfaces || []).map((net) => `
      <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 1.2rem; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.75rem;">
        <span class="badge ${net.isLoopback ? 'badge-local' : 'badge-lan'}">${net.interfaceName} (${net.category})</span>
        <div style="background: #0d1117; padding: 10px; border-radius: 12px; border: 1px solid var(--border-neon); display: inline-block;">
          <img src="${net.qrDataUrl}" alt="QR Code" style="width: 160px; height: 160px; display: block; border-radius: 6px;" />
        </div>
        <div style="font-family: var(--font-mono); font-size: 0.82rem; word-break: break-all; color: var(--accent-cyan);">
          ${net.url}
        </div>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;">
          <button class="btn btn-glass btn-sm" onclick="navigator.clipboard.writeText('${net.url}'); window.networkHud.showToast('Enlace de red local copiado', 'success');">
            Copiar Enlace
          </button>
        </div>
      </div>
    `).join('');

    modal.innerHTML = `
      <div class="modal-box" style="max-width: 680px;">
        <div class="modal-header">
          <div class="modal-title">
            <span>📱</span> Conectar Dispositivos (Local e Internet)
          </div>
          <button class="modal-close" onclick="document.getElementById('qr-share-modal').classList.remove('active')">&times;</button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; max-height: 65vh; overflow-y: auto; padding-right: 4px;">
          ${internetCardHtml}
          ${interfacesHtml}
        </div>
        <div style="margin-top: 1.5rem; text-align: right;">
          <button class="btn btn-cyan btn-sm" onclick="document.getElementById('qr-share-modal').classList.remove('active')">
            Cerrar
          </button>
        </div>
      </div>
    `;

    modal.classList.add('active');
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  async triggerStartTunnel() {
    this.showToast('⏳ Iniciando túnel seguro de Internet...', 'info');
    try {
      const res = await fetch('/api/tunnel/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        this.showToast('✅ ¡Túnel de Internet listo!', 'success');
        await this.fetchNetworkInfo();
        this.renderHeaderHud();
        this.showQrModal(); // Refresh modal with active QR
      }
    } catch (e) {
      this.showToast('Error iniciando túnel: ' + e.message, 'danger');
    }
  }

  initTelemetry() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

    try {
      this.telemetryWs = new WebSocket(wsUrl);

      this.telemetryWs.onopen = () => {
        this.telemetryWs.send(JSON.stringify({
          type: 'identify',
          role: this.clientRole,
          name: this.clientName
        }));
      };

      this.telemetryWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleTelemetryMessage(msg);
        } catch (e) {
          console.error('Error parseando telemetría:', e);
        }
      };

      this.telemetryWs.onclose = () => {
        setTimeout(() => this.initTelemetry(), 3000);
      };
    } catch (e) {
      console.warn('Error iniciando socket de telemetría:', e);
    }
  }

  handleTelemetryMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        if (msg.station && this.onStationUpdate) {
          this.onStationUpdate(msg.station);
        }
        if (msg.internet && this.onInternetUpdate) {
          this.onInternetUpdate(msg.internet);
        }
        if (this.onListenerChange) {
          this.onListenerChange(msg.activeCount);
        }
        break;

      case 'tunnel_status':
        if (this.networkData) {
          this.networkData.internet = msg.internet;
        }
        this.renderHeaderHud();
        if (this.onInternetUpdate) {
          this.onInternetUpdate(msg.internet);
        }
        break;

      case 'listener_joined':
        if (this.clientRole === 'broadcaster' || this.clientRole === 'admin') {
          const isWan = msg.client.category.includes('Internet') || msg.client.category.includes('Externa');
          const icon = isWan ? '🌍' : '🟢';
          const title = isWan ? '¡Nuevo oyente desde INTERNET!' : 'Nuevo oyente en Red Local';
          this.showToast(
            `${icon} ${title}: IP ${msg.client.ip} (${msg.client.device} - ${msg.client.os})`,
            isWan ? 'success' : 'info'
          );
        }
        if (this.onListenerChange) {
          this.onListenerChange(msg.activeCount);
        }
        break;

      case 'listener_left':
        if (this.onListenerChange) {
          this.onListenerChange(msg.activeCount);
        }
        break;

      case 'metadata_update':
      case 'broadcast_started':
      case 'broadcast_stopped':
        if (this.onStationUpdate && msg.station) {
          this.onStationUpdate(msg.station);
        }
        break;

      case 'new_shoutout':
        if (this.onShoutoutReceived && msg.shoutout) {
          this.onShoutoutReceived(msg.shoutout);
        }
        if (this.clientRole === 'broadcaster') {
          this.showToast(`💬 Mensaje de ${msg.shoutout.name} (${msg.shoutout.ip}): "${msg.shoutout.message}"`, 'purple');
        }
        break;
    }
  }

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';

    let icon = 'ℹ️';
    let borderColor = 'var(--border-neon)';
    if (type === 'success') {
      icon = '🌍';
      borderColor = 'var(--accent-green)';
    } else if (type === 'danger') {
      icon = '⚠️';
      borderColor = 'var(--accent-red)';
    } else if (type === 'purple') {
      icon = '🎙️';
      borderColor = 'var(--accent-purple)';
    }

    toast.style.borderColor = borderColor;
    toast.innerHTML = `
      <span style="font-size: 1.2rem;">${icon}</span>
      <div style="flex: 1; line-height: 1.35;">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-leave');
      setTimeout(() => toast.remove(), 250);
    }, 4500);
  }
}

// Global helper
window.networkHud = new NetworkHUD();
