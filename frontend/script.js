/**
 * Scan Browser - Frontend Script v2.1
 * All core features restored and working.
 */

(function () {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        BACKEND_URL: 'https://browser-scan.onrender.com/receive',
        // BACKEND_URL: 'http://localhost:8000/receive', // ← use this for local dev
        ADMIN_STATS_URL: 'https://browser-scan.onrender.com/api/admin/stats',
        // ADMIN_STATS_URL: 'http://localhost:8000/api/admin/stats', // ← local dev
        ADMIN_API_KEY: 'scanbrowser-admin-2026',
        STORAGE_KEY: 'lastScan',
        STORAGE_TIME_KEY: 'scanTime',
        SESSION_DURATION: 20 * 60 * 1000, // 20 minutes
        GEO_TIMEOUT: 8000
    };

    // ============================================
    // GLOBAL STATE
    // ============================================
    let map = null;
    let mapMarker = null;

    // ============================================
    // INITIALIZATION
    // ============================================
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        restoreSession();
        loadAdminStats();
        attachEventListeners();
    }

    function restoreSession() {
        const savedData = localStorage.getItem(CONFIG.STORAGE_KEY);
        const savedTime = localStorage.getItem(CONFIG.STORAGE_TIME_KEY);

        if (savedData && savedTime && (Date.now() - parseInt(savedTime) < CONFIG.SESSION_DURATION)) {
            try {
                const data = JSON.parse(savedData);
                displayResults(data);

                // Restore map if coordinates are available
                if (data.latitude && data.longitude &&
                    data.latitude !== 'Denied' && data.latitude !== 'N/A') {
                    renderMap(parseFloat(data.latitude), parseFloat(data.longitude));
                }
            } catch (e) {
                console.warn('Failed to restore session data');
            }
        }
    }

    function attachEventListeners() {
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', handleScan);
        }
    }

    // ============================================
    // SCAN HANDLER
    // ============================================
    async function handleScan() {
        const status = document.getElementById('status');
        const btn = document.getElementById('sendBtn');

        if (btn.disabled) return;

        btn.disabled = true;
        btn.classList.add('loading');
        updateStatus(status, 'Analyzing System & Locating...', 'loading');

        try {
            // Run geolocation first (triggers map render inside on success)
            const locationData = await getGeolocation();

            // Run battery in parallel with the map already rendering
            const battery = await getBatteryInfo();

            const browserInfo = detectBrowser();

            const uiData = {
                browser: browserInfo,
                cores: navigator.hardwareConcurrency || 'N/A',
                memory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A',
                latitude: locationData.lat,
                longitude: locationData.lng,
                battery: battery,
                connection: navigator.connection?.effectiveType || 'N/A'
            };

            // Persist
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(uiData));
            localStorage.setItem(CONFIG.STORAGE_TIME_KEY, Date.now().toString());

            // Show results
            displayResults(uiData);

            // Transmit to backend
            updateStatus(status, 'Transmitting Audit...', 'loading');
            const success = await transmitData(uiData);

            if (success) {
                updateStatus(status, 'Audit Logged Successfully', 'success');
                loadAdminStats();
            } else {
                updateStatus(status, 'Sync Error — Data Saved Locally', 'error');
            }

        } catch (error) {
            console.error('Scan error:', error);
            updateStatus(status, 'Sync Error — Data Saved Locally', 'error');
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    }

    // ============================================
    // BROWSER DETECTION
    // ============================================
    function detectBrowser() {
        const ua = navigator.userAgent;

        if (navigator.brave?.isBrave?.()) return 'Brave Browser';
        if (ua.includes('Edg/')) return 'Microsoft Edge';
        if (ua.includes('Chrome') && window.chrome) return 'Google Chrome';
        if (ua.includes('Firefox')) return 'Mozilla Firefox';
        if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
        return 'Mobile Browser';
    }

    // ============================================
    // GEOLOCATION — renders map on success
    // ============================================
    function getGeolocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ lat: 'N/A', lng: 'N/A' });
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    // Render map immediately on success (matches old-frontend behaviour)
                    renderMap(latitude, longitude);
                    resolve({
                        lat: latitude.toFixed(4),
                        lng: longitude.toFixed(4)
                    });
                },
                () => resolve({ lat: 'Denied', lng: 'Denied' }),
                {
                    enableHighAccuracy: true,
                    timeout: CONFIG.GEO_TIMEOUT,
                    maximumAge: 0
                }
            );
        });
    }

    // ============================================
    // BATTERY INFO
    // ============================================
    function getBatteryInfo() {
        return new Promise((resolve) => {
            if ('getBattery' in navigator) {
                navigator.getBattery()
                    .then((battery) => resolve(`${Math.round(battery.level * 100)}%`))
                    .catch(() => resolve('N/A'));
            } else {
                resolve('N/A');
            }
        });
    }

    // ============================================
    // DATA TRANSMISSION
    // ============================================
    async function transmitData(data) {
        try {
            const response = await fetch(CONFIG.BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    timestamp: new Date().toISOString()
                })
            });
            return response.ok;
        } catch (error) {
            console.error('Transmission error:', error);
            return false;
        }
    }

    // ============================================
    // STATUS MANAGEMENT
    // ============================================
    function updateStatus(element, message, state) {
        if (!element) return;

        element.className = 'status-box';
        if (state) element.classList.add(state);

        const iconMap = {
            'loading': 'fa-spinner fa-spin',
            'success': 'fa-check-circle',
            'error': 'fa-exclamation-circle'
        };

        const iconClass = iconMap[state] || 'fa-shield-halved';
        element.innerHTML = `
            <div class="status-icon">
                <i class="fas ${iconClass}"></i>
            </div>
            <span>${message}</span>
        `;
    }

    // ============================================
    // MAP RENDERING
    // ============================================
    function renderMap(lat, lng) {
        const mapDiv = document.getElementById('map');
        const infoPreview = document.getElementById('infoPreview');

        if (!mapDiv) return;

        // Show map, hide info preview
        mapDiv.style.display = 'block';
        if (infoPreview) infoPreview.style.display = 'none';

        if (!map) {
            // Initialize the Leaflet map
            map = L.map('map', {
                zoomControl: false,
                tap: false,        // Deprecated in Leaflet 1.9 — caused duplicate touch events
                dragging: true,    // Allow panning on desktop
                scrollWheelZoom: false
            }).setView([lat, lng], 13);

            // Use OpenStreetMap tiles — reliable from all origins including file://
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                detectRetina: true,
                maxZoom: 19
            }).addTo(map);

            // Custom marker matching the cyan/indigo accent palette
            const markerIcon = L.divIcon({
                className: 'custom-marker',
                html: `
                    <div style="
                        width: 36px; height: 36px;
                        background: linear-gradient(135deg, #22d3ee, #818cf8);
                        border-radius: 50% 50% 50% 0;
                        transform: rotate(-45deg);
                        box-shadow: 0 4px 16px rgba(34, 211, 238, 0.5);
                        display: flex; align-items: center; justify-content: center;
                    ">
                        <div style="
                            width: 10px; height: 10px;
                            background: #0f172a;
                            border-radius: 50%;
                            transform: rotate(45deg);
                        "></div>
                    </div>
                `,
                iconSize: [36, 36],
                iconAnchor: [18, 36],
                popupAnchor: [0, -38]
            });

            mapMarker = L.marker([lat, lng], { icon: markerIcon })
                .addTo(map)
                .bindPopup('<strong>System Located</strong><br>GPS coordinates captured')
                .openPopup();

        } else {
            // Update existing map view and marker
            map.setView([lat, lng], 13);
            if (mapMarker) {
                mapMarker.setLatLng([lat, lng]).openPopup();
            }
        }

        // Force Leaflet to recalculate tile layout.
        // Call immediately (sync) + via timeouts to handle any paint-delay scenarios.
        map.invalidateSize();
        setTimeout(() => map.invalidateSize(), 150);
        setTimeout(() => {
            map.invalidateSize();
            map.eachLayer((layer) => { if (layer.redraw) layer.redraw(); });
        }, 500);

        // On touch devices, disable map dragging so a finger on the map
        // scrolls the page normally instead of panning the map and getting "stuck".
        if (L.Browser.touch) {
            map.dragging.disable();
        }
    }

    // ============================================
    // RESULTS DISPLAY
    // ============================================
    function displayResults(data) {
        const resultsDiv = document.getElementById('results');
        const infoPreview = document.getElementById('infoPreview');

        if (!resultsDiv) return;

        if (infoPreview) infoPreview.style.display = 'none';

        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'grid';

        let delay = 0;
        Object.entries(data).forEach(([key, value]) => {
            // Skip missing, denied, or hidden values
            if (!value || value === 'N/A' || value === 'Hidden' || value === 'Denied') return;

            const item = document.createElement('div');
            item.className = 'result-item';
            item.style.animationDelay = `${delay}ms`;
            item.innerHTML = `
                <span class="result-label">${formatLabel(key)}</span>
                <span class="result-value">${escapeHtml(String(value))}</span>
            `;
            resultsDiv.appendChild(item);
            delay += 50;
        });
    }

    function formatLabel(key) {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .replace(/^\w/, c => c.toUpperCase())
            .trim();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================
    // ADMIN STATISTICS
    // ============================================
    async function loadAdminStats() {
        const statsDiv = document.getElementById('adminStats');
        const totalCount = document.getElementById('totalCount');
        const browserNiche = document.getElementById('browserNiche');

        if (!statsDiv || !totalCount || !browserNiche) return;

        try {
            const response = await fetch(CONFIG.ADMIN_STATS_URL, {
                headers: { 'x-admin-key': CONFIG.ADMIN_API_KEY }
            });

            if (!response.ok) throw new Error('Stats unavailable');

            const data = await response.json();

            statsDiv.style.display = 'block';
            totalCount.textContent = `Total Audits: ${data.totalRequests.toLocaleString()}`;

            browserNiche.innerHTML = '<strong>Browser Distribution:</strong><br>';
            data.browsers.forEach(b => {
                const name = escapeHtml(b._id || 'Unknown');
                const pct = ((b.count / data.totalRequests) * 100).toFixed(1);
                browserNiche.innerHTML += `
                    <span style="display:inline-block; margin-right:12px;">
                        <span style="color:var(--accent-cyan);">&#9679;</span>
                        ${name}: ${b.count} (${pct}%)
                    </span>
                `;
            });

        } catch (error) {
            console.warn('Admin stats unavailable or server offline');
        }
    }

})();
