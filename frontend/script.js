let map; // Global map variable to persist the map instance

// CONFIGURATION: Update this to your production URL when deploying
const BACKEND_URL = 'https://browser-scan.onrender.com/receive';

// --- 0. Persistence: Auto-Load & Stats Initialization ---
window.addEventListener('DOMContentLoaded', () => {
    const savedData = localStorage.getItem('lastScan');
    const savedTime = localStorage.getItem('scanTime');

    // If a scan exists and is less than 20 minutes old, restore UI
    if (savedData && savedTime && (Date.now() - savedTime < 20 * 60 * 1000)) {
        const data = JSON.parse(savedData);
        displayResults(data);

        // Auto-render the map on load if coordinates exist
        if (data.latitude && data.longitude && data.latitude !== 'Denied' && data.latitude !== 'N/A') {
            renderMap(parseFloat(data.latitude), parseFloat(data.longitude));
        }
    }

    // Load System Wide Admin Stats on page load
    loadAdminStats();
});

// --- 1. Admin Stats Logic ---
async function loadAdminStats() {
    const statsDiv = document.getElementById('adminStats');
    const totalCount = document.getElementById('totalCount');
    const browserNiche = document.getElementById('browserNiche');

    try {
        // Points to /api/admin/stats by replacing the receive endpoint in the URL
        const statsURL = BACKEND_URL.replace('/receive', '/api/admin/stats');
        const response = await fetch(statsURL);

        if (!response.ok) throw new Error('Stats unavailable');

        const data = await response.json();

        // Reveal the stats box and populate data
        statsDiv.style.display = 'block';
        totalCount.textContent = `Total Audits: ${data.totalRequests}`;

        // Build the browser distribution list (niche data)
        browserNiche.innerHTML = '<strong style="color: var(--accent);">Browser Distribution:</strong><br>';
        data.browsers.forEach(b => {
            const browserName = b._id || 'Unknown';
            browserNiche.innerHTML += `• ${browserName}: ${b.count} requests<br>`;
        });
    } catch (e) {
        console.warn("Admin stats could not be loaded or server is offline.");
    }
}

// --- 2. Main Scan Logic ---
document.getElementById('sendBtn').addEventListener('click', async () => {
    const status = document.getElementById('status');
    const btn = document.getElementById('sendBtn');

    // Initial UI Feedback
    btn.disabled = true;
    status.className = 'status-box loading';
    status.textContent = 'Analyzing System & Locating...';

    // Advanced Browser Detection
    const detectBrowser = () => {
        const ua = navigator.userAgent;
        if (navigator.brave) return "Brave Browser";
        if (ua.includes("Edg/")) return "Edge";
        if (ua.includes("Chrome") && !!window.chrome) return "Chrome";
        if (ua.includes("Firefox")) return "Firefox";
        if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
        return "Mobile Browser";
    };

    // Optimized Geolocation
    const getGeo = () => new Promise((resolve) => {
        if (!navigator.geolocation) resolve({ lat: 'N/A', lng: 'N/A' });
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                renderMap(latitude, longitude);
                resolve({ lat: latitude.toFixed(4), lng: longitude.toFixed(4) });
            },
            (err) => resolve({ lat: 'Denied', lng: 'Denied' }),
            { enableHighAccuracy: true, timeout: 8000 }
        );
    });

    // Battery Analysis
    const getBattery = async () => {
        if ('getBattery' in navigator) {
            try {
                const b = await navigator.getBattery();
                return Math.round(b.level * 100) + "%";
            } catch (e) { return "N/A"; }
        }
        return "N/A";
    };

    // Execution and Data Gathering
    const locationData = await getGeo();
    const battery = await getBattery();

    const uiData = {
        browser: detectBrowser(),
        cores: navigator.hardwareConcurrency || 'N/A',
        memory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A',
        latitude: locationData.lat,
        longitude: locationData.lng,
        battery: battery,
        connection: navigator.connection?.effectiveType || 'N/A'
    };

    // Persistence & Immediate UI Update
    localStorage.setItem('lastScan', JSON.stringify(uiData));
    localStorage.setItem('scanTime', Date.now());
    displayResults(uiData);

    status.textContent = 'Transmitting Audit...';

    // Transmission to Backend
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...uiData, timestamp: new Date().toISOString() })
        });

        if (response.ok) {
            status.className = 'status-box success';
            status.textContent = '✓ Audit Logged Successfully';

            // Refresh admin stats immediately after a successful submission
            loadAdminStats();
        } else {
            throw new Error('Server returned ' + response.status);
        }
    } catch (error) {
        status.className = 'status-box error';
        status.textContent = 'Sync Error: Data Saved Locally';
        console.error('Transmission Error:', error);
    } finally {
        btn.disabled = false;
    }
});

// --- 3. Helper: Map Rendering ---
function renderMap(lat, lng) {
    const mapDiv = document.getElementById('map');
    const infoPreview = document.getElementById('infoPreview');

    if (mapDiv) {
        mapDiv.style.display = 'block';
        if (infoPreview) infoPreview.style.display = 'none';

        if (!map) {
            // zoomControl: false for a cleaner mobile UI
            map = L.map('map', { zoomControl: false }).setView([lat, lng], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(map);
        } else {
            map.setView([lat, lng], 13);
        }

        L.marker([lat, lng]).addTo(map).bindPopup('System Located').openPopup();

        // Fix for tile rendering issues in hidden containers
        setTimeout(() => map.invalidateSize(), 300);
    }
}

// --- 4. Helper: Result Display ---
function displayResults(data) {
    const resultsDiv = document.getElementById('results');
    const infoPreview = document.getElementById('infoPreview');

    if (infoPreview) infoPreview.style.display = 'none';
    if (resultsDiv) {
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'grid';

        Object.entries(data).forEach(([key, value]) => {
            // Filter out hidden or denied values for a cleaner UI
            if (value && value !== 'N/A' && value !== 'Hidden' && value !== 'Denied') {
                const item = document.createElement('div');
                item.className = 'result-item';
                item.innerHTML = `
                    <span class="result-label">${key}</span>
                    <span class="result-value">${value}</span>
                `;
                resultsDiv.appendChild(item);
            }
        });
    }
}