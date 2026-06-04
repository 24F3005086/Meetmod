// ─────────────────────────────────────────────────────────
//  MeetMod — Analytics Charts
//  Chart.js wrapper for speaking-time distribution
//  visualizations with dark theme styling.
// ─────────────────────────────────────────────────────────

class AnalyticsCharts {
  constructor() {
    this.pieChart = null;
    this.barChart = null;
    this._animationDuration = 600;
  }

  /**
   * Initialize the doughnut (pie) chart.
   * @param {string} canvasId – DOM ID of the canvas element
   * @returns {Chart}
   */
  initPieChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.warn(`[Charts] Canvas #${canvasId} not found`);
      return null;
    }

    const ctx = canvas.getContext('2d');

    this.pieChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: [],
            borderColor: 'rgba(15, 15, 25, 0.8)',
            borderWidth: 2,
            hoverBorderColor: '#ffffff',
            hoverBorderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        animation: {
          animateRotate: true,
          animateScale: false,
          duration: this._animationDuration,
          easing: 'easeOutQuart',
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: 'rgba(15, 15, 25, 0.95)',
            titleColor: '#ffffff',
            bodyColor: 'rgba(255, 255, 255, 0.8)',
            borderColor: 'rgba(108, 92, 231, 0.3)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 12,
            displayColors: true,
            usePointStyle: true,
            callbacks: {
              label: function (context) {
                const value = context.parsed;
                return ` ${value.toFixed(1)}% speaking time`;
              },
            },
          },
        },
      },
    });

    return this.pieChart;
  }

  /**
   * Initialize the horizontal bar chart.
   * @param {string} canvasId – DOM ID of the canvas element
   * @returns {Chart}
   */
  initBarChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.warn(`[Charts] Canvas #${canvasId} not found`);
      return null;
    }

    const ctx = canvas.getContext('2d');

    this.barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: [],
            borderColor: [],
            borderWidth: 1,
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: this._animationDuration,
          easing: 'easeOutQuart',
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
              drawBorder: false,
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.5)',
              font: { size: 11, family: 'Inter' },
              callback: (value) => `${value}%`,
            },
          },
          y: {
            grid: {
              display: false,
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.8)',
              font: { size: 12, family: 'Inter', weight: '500' },
              padding: 8,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: 'rgba(15, 15, 25, 0.95)',
            titleColor: '#ffffff',
            bodyColor: 'rgba(255, 255, 255, 0.8)',
            borderColor: 'rgba(108, 92, 231, 0.3)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 12,
            callbacks: {
              label: function (context) {
                return ` ${context.parsed.x.toFixed(1)}% of total speaking time`;
              },
            },
          },
        },
      },
    });

    return this.barChart;
  }

  /**
   * Update both charts with new participant data.
   * @param {object[]} participantData – [{ name, totalTime, percentage, color }]
   */
  updateCharts(participantData) {
    if (!participantData || participantData.length === 0) return;

    // Sort by percentage descending
    const sorted = [...participantData].sort(
      (a, b) => b.percentage - a.percentage
    );

    const labels = sorted.map((p) => p.name);
    const percentages = sorted.map((p) => p.percentage);
    const colors = sorted.map((p) => p.color);
    const borderColors = colors.map((c) =>
      c.replace(')', ', 0.8)').replace('rgb', 'rgba')
    );

    // Update pie chart
    if (this.pieChart) {
      this.pieChart.data.labels = labels;
      this.pieChart.data.datasets[0].data = percentages;
      this.pieChart.data.datasets[0].backgroundColor = colors;
      this.pieChart.update('none'); // Skip animation for smooth updates
    }

    // Update bar chart
    if (this.barChart) {
      this.barChart.data.labels = labels;
      this.barChart.data.datasets[0].data = percentages;
      this.barChart.data.datasets[0].backgroundColor = colors.map(
        (c) => c + '99'
      );
      this.barChart.data.datasets[0].borderColor = colors;
      this.barChart.update('none');
    }
  }

  /**
   * Destroy both charts and free resources.
   */
  destroy() {
    if (this.pieChart) {
      this.pieChart.destroy();
      this.pieChart = null;
    }
    if (this.barChart) {
      this.barChart.destroy();
      this.barChart = null;
    }
    console.log('[Charts] Destroyed');
  }
}

// Export to global scope
window.AnalyticsCharts = AnalyticsCharts;
