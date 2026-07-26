// ==========================================
// 1. Quản lý Trạng thái & Theme
// ==========================================
let logs = JSON.parse(localStorage.getItem("ai_hub_logs")) || [];
let isSortNewest = true;
let showAllLogs = false;
let showAllChartData = false;
let chartInstance = null;

const themes = ["gold", "cyber", "blood", "emerald"];
let currentTheme = localStorage.getItem("ai_hub_theme") || "gold";
document.body.className = `theme-${currentTheme}`;

const themeBtn = document.getElementById("theme-toggle-btn");
if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    let idx = (themes.indexOf(currentTheme) + 1) % themes.length;
    currentTheme = themes[idx];
    document.body.className = `theme-${currentTheme}`;
    localStorage.setItem("ai_hub_theme", currentTheme);

    if (chartInstance) {
      renderFluctuationChart();
    }
  });
}

// Quick Fill Tag
window.quickFill = function (text) {
  const previewText = document.getElementById("preview-text");
  if (previewText) {
    previewText.value = text;
    toggleClearBtn();
    previewText.focus();
  }
};

// ==========================================
// 2. Chuyển Tab
// ==========================================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((c) => c.classList.remove("active"));

    btn.classList.add("active");
    const target = document.getElementById(`tab-${btn.dataset.tab}`);
    if (target) target.classList.add("active");

    if (btn.dataset.tab === "chart") {
      if (chartInstance) {
        chartInstance.resize();
      } else {
        renderFluctuationChart();
      }
    }
  });
});

// ==========================================
// 3. Ghi âm giọng nói
// ==========================================
const recordBtn = document.getElementById("record-btn");
const previewText = document.getElementById("preview-text");
const statusDiv = document.getElementById("status");
const clearBtn = document.getElementById("clear-input-btn");
let recognition = null;
let isRecording = false;

function resetRecognition() {
  if (recognition && isRecording) {
    try {
      recognition.abort();
    } catch (e) {
      console.log("Reset recognition error:", e);
    }
  }
  isRecording = false;
  if (recordBtn) {
    recordBtn.classList.remove("recording");
    const recordText = document.getElementById("record-text");
    if (recordText) recordText.innerText = "Nói ngay";
  }
}

if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "vi-VN";

  recognition.onstart = () => {
    isRecording = true;
    if (recordBtn) recordBtn.classList.add("recording");
    const recordText = document.getElementById("record-text");
    if (recordText) recordText.innerText = "Đang nghe...";
    if (statusDiv)
      statusDiv.innerText = "🎙️ Đang lắng nghe giọng nói của bạn...";
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      transcript += event.results[i][0].transcript;
    }
    if (previewText) previewText.value = transcript;
    toggleClearBtn();
  };

  recognition.onerror = (e) => {
    if (e.error === "aborted") return;
    if (statusDiv) statusDiv.innerText = "Lỗi ghi âm: " + e.error;
  };

  recognition.onend = () => {
    resetRecognition();
    if (statusDiv && statusDiv.innerText.includes("Đang lắng nghe")) {
      statusDiv.innerText = "Sẵn sàng nhận lệnh...";
    }
  };
} else {
  if (recordBtn) recordBtn.style.display = "none";
  if (statusDiv)
    statusDiv.innerText = "Trình duyệt không hỗ trợ ghi âm trực tiếp";
}

if (recordBtn) {
  recordBtn.addEventListener("click", () => {
    if (!recognition) return;
    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        resetRecognition();
        recognition.start();
      }
    }
  });
}

if (previewText) previewText.addEventListener("input", toggleClearBtn);

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    resetRecognition();
    if (previewText) previewText.value = "";
    toggleClearBtn();
    if (statusDiv) statusDiv.innerText = "Sẵn sàng nhận lệnh...";
  });
}

function toggleClearBtn() {
  if (clearBtn && previewText) {
    clearBtn.style.display = previewText.value.length > 0 ? "flex" : "none";
  }
}

// ==========================================
// 4. Parser Thông minh Tự động Linh hoạt
// ==========================================
function parseAndCleanInput(rawText) {
  let text = rawText.trim();

  // Bắt lệnh a, b, c, d bất kể vị trí
  const match = text.match(/([abcdABCD])\s*(\d+(?:[\.,]\d+)*)/);
  if (!match) {
    return {
      error:
        "⚠️ Chưa nhận diện được số lượng! Dùng cú pháp a/b (Tài chính) hoặc c/d (Lối sống). VD: 'a400 làm việc', 'ăn uống b50', 'c2 đọc sách'",
    };
  }

  const type = match[1].toLowerCase();
  const val = parseInt(match[2].replace(/[\.,]/g, ""), 10);
  if (isNaN(val)) {
    return { error: "⚠️ Con số nhập vào không hợp lệ!" };
  }

  let finValue = 0;
  let lifeValue = 0;

  if (type === "a") finValue = val;
  else if (type === "b") finValue = -val;
  else if (type === "c") lifeValue = val;
  else if (type === "d") lifeValue = -val;

  // Lọc lấy nội dung công việc
  text = text.replace(/([abcdABCD])\s*(\d+(?:[\.,]\d+)*)/g, "").trim();

  if (!text) {
    text = type === "a" || type === "b" ? "Thu/Chi Tài chính" : "Thói quen Lối sống";
  }

  text = text.charAt(0).toUpperCase() + text.slice(1);

  return {
    cleanText: text,
    finValue: finValue,
    lifeValue: lifeValue,
  };
}

// ==========================================
// 5. Lưu Nhật ký & Cập nhật Dashboard
// ==========================================
const saveBtn = document.getElementById("save-btn");
if (saveBtn) {
  saveBtn.addEventListener("click", () => {
    const rawText = previewText ? previewText.value.trim() : "";
    if (!rawText) {
      if (statusDiv) statusDiv.innerText = "⚠️ Vui lòng nhập hoặc nói nội dung!";
      return;
    }

    const result = parseAndCleanInput(rawText);

    if (result.error) {
      if (statusDiv) statusDiv.innerText = result.error;
      return;
    }

    const newLog = {
      id: Date.now(),
      text: result.cleanText,
      finValue: result.finValue || 0,
      lifeValue: result.lifeValue || 0,
      timestamp: new Date().toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }),
    };

    logs.unshift(newLog);
    localStorage.setItem("ai_hub_logs", JSON.stringify(logs));

    resetRecognition();
    if (previewText) previewText.value = "";
    toggleClearBtn();
    if (statusDiv) statusDiv.innerText = "✅ Đã lưu thành công!";
    
    updateMetrics();
    renderLogs();
    renderFluctuationChart();
  });
}

// ==========================================
// 6. Cập nhật Thanh Thống kê (Metrics)
// ==========================================
function updateMetrics() {
  let totalFin = 0;
  let totalLife = 0;

  logs.forEach((l) => {
    totalFin += l.finValue !== undefined ? l.finValue : (l.value || 0);
    totalLife += l.lifeValue || 0;
  });

  const finEl = document.getElementById("metric-fin-total");
  const lifeEl = document.getElementById("metric-life-total");

  if (finEl) finEl.innerText = `${totalFin.toLocaleString("vi-VN")} ₫`;
  if (lifeEl) lifeEl.innerText = `${totalLife > 0 ? "+" : ""}${totalLife} pts`;
}

// ==========================================
// 7. Hiển thị danh sách Nhật ký (Đã sửa màu c/d đồng bộ xanh/đỏ)
// ==========================================
const sortToggleBtn = document.getElementById("sort-toggle-btn");
if (sortToggleBtn) {
  sortToggleBtn.addEventListener("click", (e) => {
    isSortNewest = !isSortNewest;
    e.target.innerText = isSortNewest ? "⬆️ Mới nhất" : "⬇️ Cũ nhất";
    renderLogs();
  });
}

const toggleLogsBtn = document.getElementById("toggle-logs-btn");
if (toggleLogsBtn) {
  toggleLogsBtn.addEventListener("click", () => {
    showAllLogs = !showAllLogs;
    renderLogs();
  });
}

function renderLogs() {
  const container = document.getElementById("logs-container");
  if (!container) return;
  container.innerHTML = "";

  let displayLogs = [...logs];
  if (!isSortNewest) displayLogs.reverse();

  if (displayLogs.length === 0) {
    container.innerHTML =
      '<div style="text-align:center; font-size:12px; color:var(--text-muted); padding: 20px;">Chưa có dữ liệu nhật ký</div>';
    if (toggleLogsBtn) toggleLogsBtn.style.display = "none";
    return;
  }

  const totalLogs = displayLogs.length;
  if (totalLogs > 4) {
    if (toggleLogsBtn) {
      toggleLogsBtn.style.display = "block";
      toggleLogsBtn.innerText = showAllLogs
        ? "Thu gọn"
        : `Xem tất cả (${totalLogs})`;
    }
    if (!showAllLogs) {
      displayLogs = displayLogs.slice(0, 4);
    }
  } else {
    if (toggleLogsBtn) toggleLogsBtn.style.display = "none";
  }

  displayLogs.forEach((log) => {
    const item = document.createElement("div");
    item.className = "log-item";

    let valueHTML = "";
    let fin = log.finValue !== undefined ? log.finValue : (log.value || 0);
    let life = log.lifeValue || 0;

        // Hiển thị Tài chính: a (+) xanh lá .plus, b (-) đỏ .minus
    if (fin !== 0) {
      const cls = fin > 0 ? "plus" : "minus";
      const sign = fin > 0 ? "+" : "";
      const formattedVal =
        Math.abs(fin) >= 1000
          ? `${fin.toLocaleString("vi-VN")} ₫`
          : `${sign}${fin}`;
      valueHTML += `<span class="log-value ${cls}">${formattedVal}</span>`;
    }

    // Hiển thị Lối sống: c (+) xanh lá .plus, d (-) đỏ .minus (Đã bỏ chữ "Lối sống")
    if (life !== 0) {
      const cls = life > 0 ? "plus" : "minus";
      const sign = life > 0 ? "+" : "";
      valueHTML += `<span class="log-value ${cls}" style="margin-left: 6px;">${sign}${life}</span>`;
    }


    item.innerHTML = `
      <div class="log-info">
        <span class="log-title">${escapeHTML(log.text)}</span>
        <span class="log-time">${log.timestamp}</span>
      </div>
      <div class="log-right">
        ${valueHTML}
        <button class="btn-del" onclick="deleteLog(${log.id})" title="Xóa">🗑️</button>
      </div>
    `;
    container.appendChild(item);
  });
}

window.deleteLog = function (id) {
  logs = logs.filter((l) => l.id !== id);
  localStorage.setItem("ai_hub_logs", JSON.stringify(logs));
  updateMetrics();
  renderLogs();
  renderFluctuationChart();
};

function escapeHTML(str) {
  return str.replace(
    /[&<>'"]/g,
    (tag) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[
        tag
      ] || tag)
  );
}

// ==========================================
// 8. Vẽ Biểu đồ Trục Tung Đôi & AI Insight
// ==========================================
const toggleChartLimitBtn = document.getElementById("toggle-chart-limit-btn");
if (toggleChartLimitBtn) {
  toggleChartLimitBtn.addEventListener("click", () => {
    showAllChartData = !showAllChartData;
    toggleChartLimitBtn.innerText = showAllChartData
      ? "Top 4 gần nhất"
      : "Tất cả dữ liệu";
    renderFluctuationChart();
  });
}

function renderFluctuationChart() {
  const canvas = document.getElementById("fluctuationChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  let chronologicalLogs = [...logs].reverse().filter((l) => {
    let fin = l.finValue !== undefined ? l.finValue : (l.value || 0);
    let life = l.lifeValue || 0;
    return fin !== 0 || life !== 0;
  });

  if (chronologicalLogs.length === 0) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  let finBalance = 0;
  let lifeBalance = 0;

  let chartPoints = chronologicalLogs.map((l) => {
    let fin = l.finValue !== undefined ? l.finValue : (l.value || 0);
    let life = l.lifeValue || 0;

    finBalance += fin;
    lifeBalance += life;

    return {
      label: l.timestamp.split(" ")[0],
      finBalance: finBalance,
      lifeBalance: lifeBalance,
      text: l.text,
    };
  });

  // Tạo phân tích Insight thông minh
  generateAIInsight(finBalance, lifeBalance);

  if (!showAllChartData && chartPoints.length > 4) {
    chartPoints = chartPoints.slice(chartPoints.length - 4);
  }

  const labels = chartPoints.map((p) => p.label);
  const finData = chartPoints.map((p) => p.finBalance);
  const lifeData = chartPoints.map((p) => p.lifeBalance);

  if (chartInstance) {
    chartInstance.destroy();
  }

  let primaryColor =
    getComputedStyle(document.body).getPropertyValue("--royal-gold").trim() ||
    "#d4af37";

let lifestyleColor = "#10b981"; 


  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Tài chính (Trục Trái)",
          data: finData,
          yAxisID: "yFin",
          borderColor: primaryColor,
          backgroundColor: "rgba(212, 175, 55, 0.08)",
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: primaryColor,
        },
        {
          label: "Lối sống (Trục Phải)",
          data: lifeData,
          yAxisID: "yLife",
          borderColor: lifestyleColor,
          backgroundColor: "transparent",
          fill: false,
          tension: 0.35,
          borderWidth: 2,
          borderDash: [4, 4],
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: lifestyleColor,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "#94a3b8",
            font: { family: "Plus Jakarta Sans", size: 10 },
          },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              let point = chartPoints[context.dataIndex];
              if (context.dataset.yAxisID === "yFin") {
                return `Tài chính tích lũy: ${point.finBalance.toLocaleString("vi-VN")} (${point.text})`;
              } else {
                return `Lối sống tích lũy: ${point.lifeBalance}  (${point.text})`;
              }
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#64748b",
            font: { family: "JetBrains Mono", size: 10 },
            maxTicksLimit: showAllChartData ? 10 : 4,
          },
          grid: { color: "rgba(255, 255, 255, 0.03)" },
        },
        yFin: {
          type: "linear",
          position: "left",
          ticks: {
            color: primaryColor,
            font: { family: "JetBrains Mono", size: 9 },
            maxTicksLimit: 5,
            callback: function (value) {
              return Math.abs(value) >= 1000 ? `${value / 1000}k` : value;
            },
          },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
        },
        yLife: {
          type: "linear",
          position: "right",
          ticks: {
            color: lifestyleColor,
            font: { family: "JetBrains Mono", size: 9 },
            maxTicksLimit: 5,
          },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function generateAIInsight(finBalance, lifeBalance) {
  const box = document.getElementById("ai-insight");
  if (!box) return;

  if (finBalance > 0 && lifeBalance > 0) {
    box.innerHTML = `💡 <b>Đánh giá:</b> Tuyệt vời! Cả tài chính và lối sống của bạn đang đi lên song song một cách bền vững.`;
  } else if (finBalance < 0 && lifeBalance > 0) {
    box.innerHTML = `💡 <b>Đánh giá:</b> Bạn đang đầu tư mạnh cho Lối sống. Hãy chú ý giữ Tài chính cân bằng!`;
  } else if (finBalance > 0 && lifeBalance < 0) {
    box.innerHTML = `💡 <b>Đánh giá:</b> Tài chính đang tăng trưởng tốt, nhưng chỉ số Lối sống có dấu hiệu sụt giảm.`;
  } else {
    box.innerHTML = `💡 <b>Phân tích:</b> Hãy tiếp tục ghi chép để duy trì nhịp độ ổn định.`;
  }
}

// Service Worker Registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch((err) => console.log("Lỗi Service Worker:", err));
  });
}

// Khởi tạo
window.addEventListener("DOMContentLoaded", () => {
  updateMetrics();
  renderLogs();
  renderFluctuationChart();
});
