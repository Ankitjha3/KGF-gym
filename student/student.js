import { checkStudentAuth, logout } from '../js/auth.js';
import { db } from '../js/firebase-config.js';
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { formatCurrency, formatDate, showToast } from '../js/utils.js';
import { getPaymentSettings, markStudentPaymentPending, getAnnouncements, addProgressLog, deleteProgressLog, updateProgressLog } from '../js/db.js';

// Verify Auth
const user = checkStudentAuth();

// Global State for Payment Flow
let currentPaymentAmount = 0;
let currentPlanDetails = "";
let currentUpiId = "";
let currentAdminPhone = "";
const nameDisplay = document.getElementById('student-name-display');
if (nameDisplay) nameDisplay.textContent = user.name;
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', logout);

// --- PAGE ROUTING ---
const isHistoryPage = !!document.getElementById('month-filter');

const init = () => {
    const docRef = doc(db, "students", user.id);

    onSnapshot(docRef, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            if (isHistoryPage) {
                renderAttendanceHistory(data);
            } else {
                renderDashboard(data);
                initProgressPage(data);
            }
        } else {
            console.log("No such document!");
        }
    });

    if (isHistoryPage) {
        setupHistoryFilters();
    } else {
        renderStudentAnnouncements();
    }
};

const renderStudentAnnouncements = async () => {
    const section = document.getElementById('announcement-section');
    const list = document.getElementById('announcement-list');
    if (!list) return;

    try {
        const announcements = await getAnnouncements();
        if (announcements.length > 0) {
            section.style.display = 'block';
            list.innerHTML = '';
            announcements.forEach(a => {
                const item = document.createElement('div');
                item.style.cssText = 'padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:4px;';
                item.innerHTML = `
                    <div style="font-weight:500;">${a.message}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">${formatDate(a.date)}</div>
                `;
                list.appendChild(item);
            });
        } else {
            section.style.display = 'none';
        }
    } catch (e) {
        console.error("Error loading announcements", e);
    }
};



const renderDashboard = (data) => {
    if (!document.getElementById('monthly-fee')) return;

    // 1. Payment Stats
    let displayStatus = data.paymentStatus;
    if (displayStatus === 'PENDING_APPROVAL') displayStatus = 'Pending';

    document.getElementById('payment-status').textContent = displayStatus;
    // Styling
    const statusEl = document.getElementById('payment-status');
    statusEl.className = 'stat-value ' + (data.paymentStatus === 'PAID' ? 'text-success' : 'text-danger');

    document.getElementById('amount-paid').textContent = formatCurrency(data.paidAmount || 0);
    document.getElementById('due-amount').textContent = formatCurrency(data.dueAmount);
    document.getElementById('monthly-fee').textContent = formatCurrency(data.monthlyFee);
    document.getElementById('next-due').textContent = formatDate(data.nextDueDate);

    // Save Plan for Modal
    currentPlanDetails = data.planDetails || "";

    // Alert Logic
    const alertContainer = document.getElementById('student-alerts');
    alertContainer.innerHTML = '';
    const todayStr = new Date().toISOString().split('T')[0];

    if (data.dueAmount > 0 && data.nextDueDate && data.nextDueDate.startsWith(todayStr)) {
        alertContainer.innerHTML = `
            <div class="card" style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); color: var(--danger); padding: 1rem; text-align:center;">
                <strong>⚠️ Payment Reminder</strong><br>
                You have to pay ${formatCurrency(data.dueAmount)} today.
            </div>
        `;
    }

    // 2. Attendance Stats
    const attendance = data.attendance || {};
    const dates = Object.keys(attendance).sort().reverse();
    const totalDays = dates.length;
    const presentDays = dates.filter(d => attendance[d] === 'P').length;

    const percent = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

    // Monthly Attendance Logic
    const currentMonthPrefix = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const monthlyPresent = dates.filter(d => d.startsWith(currentMonthPrefix) && attendance[d] === 'P').length;

    document.getElementById('attendance-percent').textContent = `${percent}%`;
    document.getElementById('attendance-details').textContent = `${presentDays}/${totalDays} Present`;

    // Update Monthly Count Display
    const monthEl = document.getElementById('month-attendance-count');
    if (monthEl) monthEl.textContent = monthlyPresent;



    // 4. Pay Now Button Logic
    const payBtn = document.getElementById('pay-now-btn');
    if (data.dueAmount <= 0) {
        payBtn.disabled = true;
        payBtn.textContent = "Fully Paid";
        payBtn.classList.remove('btn-primary');
        payBtn.classList.add('btn-outline');
    } else {
        payBtn.disabled = false;
        payBtn.textContent = "Pay Now " + formatCurrency(data.dueAmount);
        payBtn.onclick = () => initiatePayment(data.dueAmount);
    }
};

const initiatePayment = async (amount) => {
    currentPaymentAmount = amount;

    // Fetch Settings
    try {
        const settings = await getPaymentSettings();
        currentUpiId = settings.upiId || "gymowner@upi";
        currentAdminPhone = settings.adminPhone || "";
    } catch (e) { console.log("Error fetching settings", e); }

    // Generate QR Code URL
    // Format: upi://pay?pa=...
    const upiString = `upi://pay?pa=${currentUpiId}&pn=KGFGym&am=${amount}&tn=Fee&cu=INR`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiString)}`;

    // Update Modal UI
    document.getElementById('qr-code-img').src = qrUrl;
    document.getElementById('pay-amount-display').textContent = formatCurrency(amount);
    document.getElementById('pay-upi-display').textContent = currentUpiId;

    // Show Modal
    const modal = document.getElementById('payment-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

// Handlers attached to window
window.sendPaymentScreenshot = () => {
    if (!currentAdminPhone) {
        showToast("Admin phone number not set. Please contact desk.", "error");
        return;
    }
    const msg = `Hi, I (Student: ${user.name}, Code: ${user.accessCode}) have paid Rs.${currentPaymentAmount}. Here is the screenshot.`;
    const url = `https://wa.me/${currentAdminPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

window.markAsPaid = async () => {
    if (confirm("Are you sure you have completed the payment? Status will act as PENDING until verified.")) {
        try {
            await markStudentPaymentPending(user.id);
            showToast("Marked as Pending! Admin will approve shortly.", "success");
            document.getElementById('payment-modal').style.display = 'none';
        } catch (e) {
            console.error(e);
            showToast("Error updating status.", "error");
        }
    }
};


// --- ATTENDANCE HISTORY PAGE LOGIC ---

let globalStudentData = null; // Store for filtering

const setupHistoryFilters = () => {
    const monthSelect = document.getElementById('month-filter');

    // Populate Select with Last 12 Months
    const today = new Date();
    // Show current month + previous 11 months
    for (let i = 0; i < 12; i++) {
        // Create date for 1st of the target month
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);

        // Manual YYYY-MM construction to avoid timezone shifts
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const value = `${year}-${month}`; // "2025-12"

        const label = d.toLocaleString('default', { month: 'long', year: 'numeric' }); // "December 2025"

        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        monthSelect.appendChild(option);
    }

    monthSelect.addEventListener('change', () => {
        if (globalStudentData) renderAttendanceHistory(globalStudentData);
    });

    // Trigger initial render
    // setTimeout to ensure data is likely loaded or handle in render logic
};

const renderAttendanceHistory = (data) => {
    globalStudentData = data;
    const monthInput = document.getElementById('month-filter').value; // "YYYY-MM"

    if (!monthInput) return;

    const attendance = data.attendance || {};
    const dates = Object.keys(attendance).sort().reverse();

    // Filter by selected month
    const filteredDates = dates.filter(date => date.startsWith(monthInput));

    const totalDays = filteredDates.length; // Count of days marked in this month (P or A)
    // Wait, usually "Percentage" is (Present / Total Days in Month) or (Present / Days Passed)?
    // Gyms usually track "Days Present". Percentage might be relative to "Days Attended vs Total Days Gym was Open"? 
    // Or just simple "Present Count".
    // For now: Percentage = (Present / Days Marked). Use logic: Total days marked in system for this month. 

    const presentCount = filteredDates.filter(d => attendance[d] === 'P').length;
    const percentage = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0;

    // Render Stats
    document.getElementById('month-present-count').textContent = presentCount;
    document.getElementById('month-percentage').textContent = `${percentage}%`;

    // Render Table
    const tbody = document.getElementById('history-list-body');
    const noData = document.getElementById('no-data-msg');
    tbody.innerHTML = '';

    if (filteredDates.length === 0) {
        noData.style.display = 'block';
    } else {
        noData.style.display = 'none';
        filteredDates.forEach(date => {
            const status = attendance[date];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatDate(date)}</td>
                <td><span class="status ${status === 'P' ? 'status-paid' : 'status-due'}">${status === 'P' ? 'Present' : 'Absent'}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
};



// --- DIET PLAN MODAL ---
window.openPlanModal = () => {
    const modal = document.getElementById('plan-modal');
    const content = document.getElementById('plan-content');

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    if (currentPlanDetails) {
        content.textContent = currentPlanDetails;
    } else {
        content.innerHTML = '<div class="text-muted text-center" style="padding:2rem;">No plan assigned yet. Ask your trainer!</div>';
    }
};

window.closePlanModal = () => {
    const modal = document.getElementById('plan-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
};

// --- PROGRESS TRACKER LOGIC ---
const initProgressPage = (data) => {
    const form = document.getElementById('progress-form');
    if (!form) return; // Not on progress page

    // Inputs
    const logIdInput = document.getElementById('log-id');
    const dateInput = document.getElementById('log-date');
    const weightInput = document.getElementById('log-weight');
    const saveBtn = document.getElementById('save-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');

    // BMI Calculation Preview
    const heightInput = document.getElementById('log-height');
    const bmiPreview = document.getElementById('bmi-preview');
    const bmiVal = document.getElementById('preview-bmi-val');
    const bmiStatus = document.getElementById('preview-bmi-status');

    const updateBMI = () => {
        const w = parseFloat(weightInput.value);
        const h = parseFloat(heightInput.value);

        if (w > 0 && h > 0) {
            const hM = h / 100;
            const bmi = (w / (hM * hM)).toFixed(1);
            bmiVal.textContent = bmi;
            bmiPreview.style.display = 'block';

            let status = 'Normal';
            let color = 'var(--success)';
            if (bmi < 18.5) { status = 'Underweight'; color = '#f1c40f'; }
            else if (bmi >= 25 && bmi < 29.9) { status = 'Overweight'; color = '#e67e22'; }
            else if (bmi >= 30) { status = 'Obese'; color = '#e74c3c'; }

            bmiStatus.textContent = status;
            bmiStatus.style.color = color;
        } else {
            bmiPreview.style.display = 'none';
        }
    };

    weightInput.addEventListener('input', updateBMI);
    heightInput.addEventListener('input', updateBMI);

    // Cancel Edit
    cancelBtn.addEventListener('click', () => {
        form.reset();
        logIdInput.value = '';
        saveBtn.textContent = 'Save Log';
        cancelBtn.style.display = 'none';
        bmiPreview.style.display = 'none';
    });

    // Form Submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('log-date').value;
        const weight = document.getElementById('log-weight').value;
        const height = document.getElementById('log-height').value;

        // Calculate BMI to store? Or calc on fly. Let's calc on fly, store raw data.

        try {
            await addProgressLog(user.id, {
                date,
                weight: parseFloat(weight),
                height: parseFloat(height),
                timestamp: Date.now()
            });
            showToast('Progress Logged!', 'success');
            form.reset();
            bmiPreview.style.display = 'none';
            // Refresh data to update list
            init();
        } catch (err) {
            console.error(err);
            showToast('Error logging progress', 'error');
        }
    });

    // Attach Window Handlers
    window.handleEditLog = (id, date, weight, height) => {
        logIdInput.value = id;
        dateInput.value = date;
        weightInput.value = weight;
        heightInput.value = height;
        updateBMI();
        saveBtn.textContent = 'Update Log';
        cancelBtn.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.handleDeleteLog = async (id) => {
        if (confirm('Delete this log?')) {
            try {
                await deleteProgressLog(user.id, id);
                showToast('Log Deleted', 'success');
                init();
            } catch (e) {
                console.error(e);
                showToast('Error deleting log', 'error');
            }
        }
    };

    renderProgressHistory(data);
};

const renderProgressHistory = (data) => {
    const listBody = document.getElementById('progress-list-body');
    if (!listBody) return;

    const logs = data.progressLogs || [];
    // Sort by date desc
    logs.sort((a, b) => new Date(b.date) - new Date(a.date));

    listBody.innerHTML = '';

    if (logs.length === 0) {
        listBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No logs yet. Start tracking!</td></tr>';
        return;
    }

    // Latest Weight Stats
    if (logs.length > 0) {
        document.getElementById('current-weight').textContent = `${logs[0].weight} kg`;
        if (logs.length > 1) {
            const diff = (logs[0].weight - logs[logs.length - 1].weight).toFixed(1);
            const sign = diff > 0 ? '+' : '';
            document.getElementById('weight-diff').textContent = `Change: ${sign}${diff} kg`;
        }
    }

    logs.forEach(log => {
        const hM = log.height / 100;
        const bmi = (log.weight / (hM * hM)).toFixed(1);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(log.date)}</td>
            <td>${log.weight} kg</td>
            <td>${log.height} cm</td>
            <td><span style="font-weight:bold;">${bmi}</span></td>
            <td>
                <button class="btn btn-outline btn-sm" style="padding:0.25rem 0.5rem;" onclick="handleEditLog('${log.id}', '${log.date}', ${log.weight}, ${log.height})">✏️</button>
                <button class="btn btn-danger btn-sm" style="padding:0.25rem 0.5rem;" onclick="handleDeleteLog('${log.id}')">🗑️</button>
            </td>
        `;
        listBody.appendChild(tr);
    });
};

init();
