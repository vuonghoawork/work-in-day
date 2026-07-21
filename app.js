// ==========================================
// 1. Đăng ký Service Worker
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

// ==========================================
// 2. Cấu hình Theme Giao diện
// ==========================================
const themes = {
    cyber: { cyan: '#00f2fe', purple: '#a855f7', pink: '#f43f5e', emerald: '#10b981', bg: 'radial-gradient(circle at 50% 0%, #1a1235 0%, #0d0e12 100%)' },
    gold: { cyan: '#f3e5ab', purple: '#d4af37', pink: '#ef4444', emerald: '#4ade80', bg: 'radial-gradient(circle at 50% 0%, #111c30 0%, #050811 100%)' },
    blood: { cyan: '#ffb3b3', purple: '#ff3333', pink: '#800000', emerald: '#10b981', bg: 'radial-gradient(circle at 50% 0%, #2a0808 0%, #080202 100%)' },
    emerald: { cyan: '#a3f7bf', purple: '#50c878', pink: '#f43f5e', emerald: '#2e8b57', bg: 'radial-gradient(circle at 50% 0%, #021a0e 0%, #020804 100%)' }
};

let activeTheme = localStorage.getItem('log_active_theme') || 'cyber';
let myChart = null;

const applyTheme = (themeKey) => {
    const t = themes[themeKey] || themes.cyber;
    const r = document.documentElement.style;
    r.setProperty('--cyan', t.cyan);
    r.setProperty('--purple', t.purple);
    r.setProperty('--pink', t.pink);
    r.setProperty('--emerald', t.emerald);
    r.setProperty('--bg-gradient', t.bg);
    
    activeTheme = themeKey;
    const select = document.getElementById('theme-select');
    if (select) select.value = themeKey;
    localStorage.setItem('log_active_theme', themeKey);
    updateChart();
};

// ==========================================
// 3. Khai báo DOM Elements & Biến Toàn cục
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recordBtn = document.getElementById('record-btn');
const saveBtn = document.getElementById('save-btn');
const previewText = document.getElementById('preview-text');
const clearInputBtn = document.getElementById('clear-input-btn');
const statusDiv = document.getElementById('status');
const logsContainer = document.getElementById('logs-container');
const clearAllBtn = document.getElementById('clear-all-btn');

const balanceDisplay = document.getElementById('balance-display');
const initBalanceInput = document.getElementById('init-balance-input');
const initBalanceBtn = document.getElementById('init-balance-btn');
const ctxCanvas = document.getElementById('financeChart').getContext('2d');

let recognition;
let isRecording = false;
let baseText = '';
let isMinting = false;
let isCleared = false;

let initialBalance = parseFloat(localStorage.getItem('wallet_initial_balance')) || 0;
let currentBalance = parseFloat(localStorage.getItem('wallet_balance')) || 0;
let financeHistory = JSON.parse(localStorage.getItem('finance_history')) || [];

// ==========================================
// 4. Các Hàm Trợ Giúp String & Parse
// ==========================================
function capitalizeFirstLetter(str) {
    if (!str) return '';
    let trimmed = str.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function removeDuplicates(text) {
    if (!text) return '';
    const words = text.trim().replace(/\s+/g, ' ').split(' ');
    if (words.length < 2) return capitalizeFirstLetter(text.trim());

    const uniqueLower = [];
    const seen = new Set();
    
    for (let word of words) {
        const lower = word.toLowerCase();
        if (!seen.has(lower)) {
            seen.add(lower);
            uniqueLower.push(lower);
        }
    }

    const filteredLower = uniqueLower.filter((lowerA, indexA) => 
        !uniqueLower.some((lowerB, indexB) => 
            indexA !== indexB && lowerB.length > lowerA.length && lowerB.includes(lowerA)
        )
    );

    return capitalizeFirstLetter(filteredLower.join(' '));
}

function mergeCommandPrefixes(text) {
    if (!text) return '';
    return text.replace(/\b([abAB])\s+(\d+(?:[\.,]\d+)*)/g, '$1$2');
}

function parseFinancialCommands(text) {
    const regex = /([abAB])(\d+(?:[\.,]\d+)*)/g;
    let match;
    let totalChange = 0;
    let detectedCmds = [];

    while ((match = regex.exec(text)) !== null) {
        const type = match[1].toLowerCase();
        const rawValue = match[2].replace(/[\.,]/g, '');
        const value = parseInt(rawValue, 10);

        if (!isNaN(value)) {
            if (type === 'a') {
                totalChange += value;
                detectedCmds.push(`+${value.toLocaleString('en-US')}$`);
            } else if (type === 'b') {
                totalChange -= value;
                detectedCmds.push(`-${value.toLocaleString('en-US')}$`);
            }
        }
    }
    return { totalChange, detectedCmds };
}

function extractTaskBaseName(text) {
    if (!text) return 'Nhiệm vụ không tên';
    const cleaned = text.replace(/([abAB])(\d+(?:[\.,]\d+)*)/g, '').trim();
    return capitalizeFirstLetter(cleaned) || text.trim();
}

function toggleClearInputBtn() {
    clearInputBtn.style.display = previewText.value.trim().length > 0 ? 'flex' : 'none';
}

// ==========================================
// 5. Đồng bộ Tài chính từ Khối Logs
// ==========================================
function recalculateFinanceFromLogs() {
    const logs = JSON.parse(localStorage.getItem('daily_logs')) || [];
    const chronologicalLogs = [...logs].reverse();

    let runningBalance = initialBalance;
    let newHistory = [];

    chronologicalLogs.forEach(log => {
        const { totalChange } = parseFinancialCommands(log.content);
        if (totalChange !== 0) {
            runningBalance += totalChange;
            const timeOnly = log.time.split(' - ')[0] || log.time;
            newHistory.push({
                time: timeOnly,
                balance: runningBalance
            });
        }
    });

    currentBalance = runningBalance;
    financeHistory = newHistory;
    updateBalanceUI();
}

// ==========================================
// 6. Cấu hình Speech Engine
// ==========================================
if (!SpeechRecognition) {
    statusDiv.innerText = "Trình duyệt không hỗ trợ nhận diện giọng nói. Hãy dùng Chrome/Edge.";
    recordBtn.disabled = true;
} else {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'vi-VN';

    recognition.onstart = () => {
        statusDiv.innerText = "Đang lắng nghe dữ liệu sóng âm...";
        recordBtn.innerHTML = "🛑 Đang ghi âm... Nhấn để dừng";
        recordBtn.classList.add('recording');
        isMinting = false; 
    };

    recognition.onresult = (event) => {
        if (isMinting || isCleared) return; 

        let currentSessionText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                currentSessionText += event.results[i][0].transcript + ' ';
            }
        }
        const rawFullText = currentSessionText.trim();
        const fullTextOnline = (baseText + ' ' + rawFullText).trim();
        
        const mergedText = mergeCommandPrefixes(fullTextOnline);
        const cleanedText = removeDuplicates(mergedText);
        previewText.value = capitalizeFirstLetter(cleanedText);
        toggleClearInputBtn();
    };

    recognition.onerror = (event) => {
        statusDiv.innerText = "Lỗi Micro hoặc HTTPS: " + event.error;
        stopRecording();
    };

    recognition.onend = () => {
        if (isRecording) {
            if (!isMinting && !isCleared) {
                baseText = previewText.value.trim();
                if (baseText.length > 0) baseText += ' ';
            }
            setTimeout(() => { 
                try { if (isRecording) recognition.start(); } catch (e) {} 
            }, 100);
        }
    };
}

function stopRecording() {
    isRecording = false;
    isMinting = false;
    if (recognition) recognition.stop();
    recordBtn.innerHTML = "🎙️ Nhấn để ghi âm";
    recordBtn.classList.remove('recording');
}

// ==========================================
// 7. Chart.js & UI Tài chính (CHỐNG VỠ BỐ CỤC)
// ==========================================
function updateChart() {
    if (!window.Chart || !ctxCanvas) return;

    const computedStyle = getComputedStyle(document.documentElement);
    const primaryColor = computedStyle.getPropertyValue('--cyan').trim() || '#00f2fe';
    const accentColor = computedStyle.getPropertyValue('--purple').trim() || '#a855f7';

    const labels = financeHistory.map(item => item.time);
    const dataValues = financeHistory.map(item => item.balance);

    if (myChart) {
        myChart.data.labels = labels;
        myChart.data.datasets[0].data = dataValues;
        myChart.data.datasets[0].borderColor = primaryColor;
        myChart.data.datasets[0].pointBackgroundColor = accentColor;
        myChart.update();
    } else {
        myChart = new Chart(ctxCanvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Số dư ($)',
                    data: dataValues,
                    borderColor: primaryColor,
                    borderWidth: 3,
                    pointBackgroundColor: accentColor,
                    pointRadius: 4,
                    tension: 0.3,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Bắt buộc false để canvas vừa khít khung
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { family: 'JetBrains Mono', size: 10 } }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: 'rgba(255, 255, 255, 0.5)', font: { family: 'JetBrains Mono', size: 10 } }
                    }
                }
            }
        });
    }
}

function updateBalanceUI() {
    balanceDisplay.innerText = currentBalance.toLocaleString('en-US');
    localStorage.setItem('wallet_balance', currentBalance);
    localStorage.setItem('finance_history', JSON.stringify(financeHistory));
    updateChart();
}

// ==========================================
// 8. RENDER LOGS UI (#NUMBER KHỐI CHÍNH DUY NHẤT 1 SỐ ĐẦU TIÊN)
// ==========================================
function displayLogs() {
    logsContainer.innerHTML = '';
    const rawLogs = JSON.parse(localStorage.getItem('daily_logs')) || [];

    if (rawLogs.length === 0) {
        logsContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:13px; padding:20px 0;">Chưa có khối dữ liệu nào hôm nay.</div>';
        clearAllBtn.style.display = 'none';
        return;
    }

    // STEP 1: Đánh số thứ tự toàn cục cho tất cả các log (1 đến N từ CŨ -> MỚI)
    const chronologicalAllLogs = [...rawLogs].reverse();
    const logGlobalIndexMap = new Map();

    chronologicalAllLogs.forEach((log, index) => {
        logGlobalIndexMap.set(log.id, index + 1);
    });

    // STEP 2: Gom nhóm các Log theo tên Nhiệm vụ
    const groupedMap = new Map();

    rawLogs.forEach(log => {
        const taskName = extractTaskBaseName(log.content);
        const { totalChange } = parseFinancialCommands(log.content);

        if (!groupedMap.has(taskName)) {
            groupedMap.set(taskName, {
                taskName: taskName,
                totalMoney: 0,
                entries: []
            });
        }

        const group = groupedMap.get(taskName);
        group.totalMoney += totalChange;
        group.entries.push({
            id: log.id,
            time: log.time,
            change: totalChange,
            globalNum: logGlobalIndexMap.get(log.id)
        });
    });

    const groupsArray = Array.from(groupedMap.values());

    groupsArray.forEach((group) => {
        const chronologicalEntries = [...group.entries].reverse();
        
        // KHỐI CHÍNH: Luôn chỉ lấy duy nhất 1 số đầu tiên (cũ nhất)
        const oldestNum = chronologicalEntries[0].globalNum;
        const blockDisplayNum = `#${oldestNum}`;

        // Xử lý Badge tổng tiền hàng 2
        let moneyClass = 'zero';
        let moneySign = '';
        if (group.totalMoney > 0) {
            moneyClass = 'plus';
            moneySign = '+';
        } else if (group.totalMoney < 0) {
            moneyClass = 'minus';
        }
        const formattedMoney = `${moneySign}${group.totalMoney.toLocaleString('en-US')}$`;

        // Render Dropdown items
        let timestampsHTML = '';

        chronologicalEntries.forEach((entry) => {
            let entryBadge = '';
            if (entry.change > 0) {
                entryBadge = `<span class="tx-badge tx-plus">+${entry.change.toLocaleString('en-US')}$</span>`;
            } else if (entry.change < 0) {
                entryBadge = `<span class="tx-badge tx-minus">${entry.change.toLocaleString('en-US')}$</span>`;
            }

            timestampsHTML += `
                <div class="timestamp-item">
                    <div class="dd-left-col">
                        <div class="dd-row-1-num">#${entry.globalNum}</div>
                        <div class="dd-row-2-time">🕒 ${entry.time}</div>
                    </div>
                    <div>
                        ${entryBadge}
                    </div>
                </div>
            `;
        });

        const item = document.createElement('div');
        item.className = 'log-item';

        item.innerHTML = `
            <!-- HÀNG 1: #number duy nhất 1 số đầu tiên -->
            <div class="log-row-1">
                <span class="log-block-num">${blockDisplayNum}</span>
                <div class="log-actions-right">
                    <button class="btn-action-icon btn-dropdown" title="Mở danh sách giờ & ngày">▼</button>
                    <button class="btn-action-icon btn-edit" title="Đổi tên nhiệm vụ">✏️</button>
                    <button class="btn-action-icon btn-delete" title="Xóa nhóm nhiệm vụ">🗑️</button>
                </div>
            </div>

            <!-- HÀNG 2: Tên Block bên trái, Số tiền sát mép phải -->
            <div class="log-row-2">
                <span class="log-task-name">${group.taskName}</span>
                <span class="log-total-money ${moneyClass}">${formattedMoney}</span>
            </div>

            <!-- DROPDOWN CONTENT -->
            <div class="log-dropdown-content">
                ${timestampsHTML}
            </div>
        `;

        // Sự kiện Toggle Dropdown
        const btnDropdown = item.querySelector('.btn-dropdown');
        const dropdownContent = item.querySelector('.log-dropdown-content');

        btnDropdown.addEventListener('click', () => {
            const isExpanded = dropdownContent.style.display === 'block';
            dropdownContent.style.display = isExpanded ? 'none' : 'block';
            if (isExpanded) {
                btnDropdown.classList.remove('active');
            } else {
                btnDropdown.classList.add('active');
            }
        });

        // Sự kiện Đổi tên Nhiệm vụ
        item.querySelector('.btn-edit').addEventListener('click', () => {
            const newName = prompt("Nhập tên mới cho nhiệm vụ:", group.taskName);
            if (newName !== null && newName.trim() !== '') {
                let currentLogs = JSON.parse(localStorage.getItem('daily_logs')) || [];
                const cleanNewName = newName.trim();

                currentLogs.forEach(log => {
                    if (extractTaskBaseName(log.content) === group.taskName) {
                        const financialMatches = log.content.match(/([abAB])(\d+(?:[\.,]\d+)*)/g);
                        const finStr = financialMatches ? financialMatches.join(' ') : '';
                        
                        log.content = `${cleanNewName} ${finStr}`.trim();
                    }
                });

                localStorage.setItem('daily_logs', JSON.stringify(currentLogs));
                recalculateFinanceFromLogs();
                displayLogs();
            }
        });

        // Sự kiện Xóa Nhóm Nhiệm vụ
        item.querySelector('.btn-delete').addEventListener('click', () => {
            if (confirm(`Xóa toàn bộ khối [${group.taskName}]?`)) {
                let currentLogs = JSON.parse(localStorage.getItem('daily_logs')) || [];
                const targetIds = group.entries.map(e => e.id);
                currentLogs = currentLogs.filter(log => !targetIds.includes(log.id));
                
                localStorage.setItem('daily_logs', JSON.stringify(currentLogs));
                recalculateFinanceFromLogs();
                displayLogs();
            }
        });

        logsContainer.appendChild(item);
    });

    clearAllBtn.style.display = 'block';
}

// ==========================================
// 9. Khởi tạo App & Event Listeners
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    applyTheme(activeTheme);
    displayLogs();
    updateBalanceUI();

    // ResizeObserver Tự động fix kích thước Canvas khi Tab container đổi cỡ
    const chartBox = document.getElementById('chart-box');
    if (chartBox && window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            if (myChart) {
                myChart.resize();
            }
        });
        ro.observe(chartBox);
    }

    // Xử lý Chuyển Tab chuẩn không vỡ Bố cục
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            e.target.classList.add('active');
            const targetTab = document.getElementById(`tab-${e.target.dataset.tab}`);
            targetTab.classList.add('active');
            
            if (e.target.dataset.tab === 'finance') {
                requestAnimationFrame(() => {
                    if (myChart) {
                        myChart.resize();
                        myChart.update('none');
                    }
                });
            }
        });
    });

    initBalanceBtn.addEventListener('click', () => {
        const val = parseFloat(initBalanceInput.value);
        if (isNaN(val)) return alert("Vui lòng nhập số tiền hợp lệ!");
        
        initialBalance = val;
        localStorage.setItem('wallet_initial_balance', initialBalance);
        initBalanceInput.value = '';
        recalculateFinanceFromLogs();
    });

    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
    }

    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const keys = Object.keys(themes);
            let nextIdx = (keys.indexOf(activeTheme) + 1) % keys.length;
            applyTheme(keys[nextIdx]);
        });
    }

    recordBtn.addEventListener('click', () => {
        if (!isRecording) {
            isRecording = true;
            isCleared = false;
            baseText = previewText.value.trim();
            if (baseText.length > 0) baseText += ' ';
            try { recognition.start(); } catch (e) {}
        } else {
            stopRecording();
            statusDiv.innerText = "Đã dừng.";
        }
    });

    previewText.addEventListener('input', () => {
        isCleared = false;
        baseText = previewText.value;
        if (baseText.length > 0 && !baseText.endsWith(' ')) baseText += ' ';
        toggleClearInputBtn();
    });

    clearInputBtn.addEventListener('click', () => {
        isCleared = true;
        previewText.value = '';
        baseText = '';

        if (isRecording && recognition) {
            try { recognition.stop(); } catch(e) {}
            statusDiv.innerText = "Đang lắng nghe dữ liệu sóng âm...";
        } else {
            statusDiv.innerText = "Đã xóa toàn bộ nội dung ô nhập.";
        }

        toggleClearInputBtn();
        previewText.focus();
        setTimeout(() => { isCleared = false; }, 300);
    });

    saveBtn.addEventListener('click', () => {
        let text = previewText.value.trim();
        if (!text) return alert("Vui lòng nhập hoặc nói nội dung dữ liệu!");

        text = mergeCommandPrefixes(text);
        isMinting = true; 

        const { detectedCmds } = parseFinancialCommands(text);
        
        const now = new Date();
        const timeString = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const fullDateString = timeString + ' - ' + now.toLocaleDateString('vi-VN');

        const logEntry = { 
            id: Date.now(), 
            time: fullDateString, 
            content: text,
            financeInfo: detectedCmds 
        };
        
        let logs = JSON.parse(localStorage.getItem('daily_logs')) || [];
        logs.unshift(logEntry);
        localStorage.setItem('daily_logs', JSON.stringify(logs));

        previewText.value = '';
        baseText = ''; 
        toggleClearInputBtn();
        statusDiv.innerText = "Khối dữ liệu đã được nạp thành công.";
        
        if (isRecording && recognition) {
            recognition.stop(); 
        } else {
            isMinting = false;
        }
        
        recalculateFinanceFromLogs();
        displayLogs();
    });

    clearAllBtn.addEventListener('click', () => {
        if (confirm("⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XÓA SẠCH toàn bộ dữ liệu?")) {
            localStorage.removeItem('daily_logs');
            localStorage.removeItem('wallet_balance');
            localStorage.removeItem('wallet_initial_balance');
            localStorage.removeItem('finance_history');

            initialBalance = 0;
            currentBalance = 0;
            financeHistory = [];

            displayLogs();
            updateBalanceUI();
            statusDiv.innerText = "Đã dọn dẹp toàn bộ dữ liệu!";
        }
    });
});
