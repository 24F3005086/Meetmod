// ─────────────────────────────────────────────────────────
//  MeetMod — Report View Controller
//  Fetches persistent report data and initializes Chart.js
//  visualizations + PDF export.
// ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // --- Parse URL Parameters ---
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('roomId');

  if (!roomId) {
    showErrorState('Invalid Room ID', 'No room ID was provided in the link. Please return to the homepage.');
    return;
  }

  // --- Fetch Report Data ---
  fetchReportData(roomId);
});

/**
 * Fetch the persistent report from Express backend
 * @param {string} roomId 
 */
async function fetchReportData(roomId) {
  try {
    const response = await fetch(`/api/reports/${roomId}`);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('This meeting report does not exist or has expired.');
      }
      throw new Error('Failed to load meeting report.');
    }

    const data = await response.json();
    if (data.success && data.report) {
      renderReport(data.report);
    } else {
      throw new Error('Report data format is invalid.');
    }
  } catch (error) {
    console.error('[Report] Fetch failed:', error);
    showErrorState('Report Not Found', error.message || 'An error occurred while fetching the report.');
  }
}

/**
 * Render database report data to DOM elements
 * @param {object} report 
 */
function renderReport(report) {
  // 1. Meta & Text info
  document.getElementById('report-room-name').textContent = report.roomName || 'Meeting Room';
  document.getElementById('report-room-code').textContent = report.roomId.slice(0, 8);
  
  const dateObj = new Date(report.createdAt);
  document.getElementById('report-date').textContent = dateObj.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Calculate meeting duration (sum of speaking times)
  const durationFormatted = formatMsLong(report.totalMeetingTime);
  document.getElementById('stat-duration').textContent = durationFormatted;
  document.getElementById('stat-participants').textContent = report.participantCount;

  // 2. Render Equity Score Progress
  const score = report.equityScore ?? 100;
  document.getElementById('equity-score').textContent = score;
  const fillRing = document.getElementById('equity-ring-fill');
  if (fillRing) {
    // 2 * PI * r = 2 * 3.14 * 48 ≈ 301.6
    const circumference = 2 * Math.PI * 48;
    const offset = circumference - (score / 100) * circumference;
    fillRing.style.strokeDasharray = circumference;
    fillRing.style.strokeDashoffset = offset;
  }

  // Define color palette matching client theme
  const colors = [
    '#6c5ce7', // Purple
    '#00cec9', // Teal
    '#fd79a8', // Pink
    '#fdcb6e', // Yellow
    '#55efc4', // Mint
    '#74b9ff', // Blue
    '#e17055', // Coral
    '#a29bfe'  // Lavender
  ];

  // 3. Populate Participant Table Cards
  const tbody = document.getElementById('report-table-body');
  tbody.innerHTML = '';

  const sortedParticipants = [...report.participants].sort((a, b) => b.totalTime - a.totalTime);

  sortedParticipants.forEach((p, idx) => {
    const color = colors[idx % colors.length];
    const initials = p.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="td-participant">
        <div class="td-avatar" style="background: ${color}20; border: 1px solid ${color}; color: ${color}">
          ${initials}
        </div>
        <span>${p.name}</span>
      </td>
      <td style="text-align: right; font-family: monospace;">${p.totalTimeFormatted}</td>
      <td style="text-align: right; font-family: monospace;">${p.longestMonologueFormatted}</td>
      <td style="text-align: right;">${p.speakCount}</td>
      <td style="text-align: right; color: ${color};" class="table-percentage">${p.percentage.toFixed(1)}%</td>
    `;
    tbody.appendChild(row);
  });

  // 4. Render Charts (Chart.js)
  const chartLabels = sortedParticipants.map(p => p.name);
  const chartData = sortedParticipants.map(p => p.percentage);
  const chartColors = sortedParticipants.map((p, idx) => colors[idx % colors.length]);

  renderDoughnutChart(chartLabels, chartData, chartColors);
  renderHorizontalBarChart(chartLabels, chartData, chartColors);

  // 5. PDF Download trigger setup
  document.getElementById('btn-download').addEventListener('click', () => {
    downloadPDF(report.roomId);
  });

  // 6. Reveal page
  document.getElementById('loading-overlay').classList.add('hidden');
  document.getElementById('report-page').classList.remove('hidden');
}

/**
 * Render Doughnut Chart using Chart.js
 */
function renderDoughnutChart(labels, data, colors) {
  const ctx = document.getElementById('chart-distribution').getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderColor: '#12121a',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: 'rgba(255, 255, 255, 0.7)',
            font: { family: 'Inter', size: 11 },
            boxWidth: 12,
            padding: 10
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${context.label}: ${context.raw.toFixed(1)}%`;
            }
          }
        }
      }
    }
  });
}

/**
 * Render Horizontal Bar Chart using Chart.js
 */
function renderHorizontalBarChart(labels, data, colors) {
  const ctx = document.getElementById('chart-ranking').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.map(c => c + '33'), // Semitransparent fill
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)',
            font: { family: 'Inter', size: 10 },
            callback: function(value) { return value + '%'; }
          },
          max: 100
        },
        y: {
          grid: { display: false },
          ticks: {
            color: 'rgba(255, 255, 255, 0.7)',
            font: { family: 'Inter', size: 10 }
          }
        }
      }
    }
  });
}

/**
 * Export the report to PDF format
 * @param {string} roomId 
 */
function downloadPDF(roomId) {
  const element = document.getElementById('report-content');
  const btn = document.getElementById('btn-download');
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:6px"></span> Generating...';

  // PDF Configuration options
  const opt = {
    margin:       [10, 10],
    filename:     `MeetMod_Report_${roomId.slice(0, 8)}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#0a0a0f' },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(element).save().then(() => {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="download" style="width:16px;height:16px;margin-right:6px"></i> Download PDF Report';
    if (window.lucide) lucide.createIcons({ nodes: [btn] });
  }).catch(err => {
    console.error('[PDF Export] Failed:', err);
    alert('Failed to generate PDF. Please try again.');
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="download" style="width:16px;height:16px;margin-right:6px"></i> Download PDF Report';
    if (window.lucide) lucide.createIcons({ nodes: [btn] });
  });
}

/**
 * Display an error message if report fetch fails
 */
function showErrorState(title, message) {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.innerHTML = `
      <div style="text-align: center; max-width: 400px; padding: 20px;">
        <div style="font-size: 3rem; margin-bottom: 16px;">⚠️</div>
        <h2 style="color: #ff7675; font-size: 1.4rem; margin-bottom: 8px;">${title}</h2>
        <p style="color: rgba(255,255,255,0.7); font-size: 0.9rem; line-height: 1.5; margin-bottom: 24px;">${message}</p>
        <a href="/" style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.85rem; transition: 0.2s;">
          Return to Home
        </a>
      </div>
    `;
    overlay.classList.remove('hidden');
  }
}

/**
 * Format milliseconds to readable string (e.g. 5m 12s or 1h 2m)
 */
function formatMsLong(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  let str = '';
  if (hours > 0) str += `${hours}h `;
  if (minutes > 0 || hours > 0) str += `${minutes}m `;
  str += `${seconds}s`;
  return str;
}
