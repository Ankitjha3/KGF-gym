
console.log("ADMIN.JS LOADED - START");
import { checkAdminAuth, logout, updateAdminPasscode } from '../js/auth.js';

import { getAllStudents, addStudent, markAttendance, approvePayment, setStudentFee, deleteStudent, getPaymentSettings, updatePaymentSettings, updateStudent, addAnnouncement, getAnnouncements, deleteAnnouncement, updateAnnouncement, getPaymentLogs } from '../js/db.js';
import { formatCurrency, formatDate, showToast } from '../js/utils.js';

// Verify Auth
checkAdminAuth();
// No more currentUser check since we are using local token

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', logout);

/* -------------------------------------------------------------
   SETTINGS
------------------------------------------------------------- */
document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const upiId = document.getElementById('setting-upi').value;
    const adminPhone = document.getElementById('setting-phone').value;

    if (!upiId) return;

    try {
        await updatePaymentSettings(upiId, adminPhone);
        showToast('Settings saved!', 'success');
    } catch (error) {
        console.error(error);
        showToast('Error saving settings', 'error');
    }
});

document.getElementById('passcode-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPass = document.getElementById('current-passcode').value.trim();
    const newPass = document.getElementById('new-passcode').value.trim();

    if (!newPass || newPass.length < 4) {
        showToast('New Passcode too short', 'error');
        return;
    }

    try {
        const msg = await updateAdminPasscode(currentPass, newPass);
        showToast(msg, 'success');
        document.getElementById('passcode-form').reset();
    } catch (error) {
        console.error(error);
        if (error.message.includes("Incorrect")) {
            showToast('Incorrect Current Passcode', 'error');
        } else {
            showToast('Error: ' + error.message, 'error');
        }
    }
});

let studentsData = [];
let currentDate = new Date().toISOString().split('T')[0];

document.getElementById('attendance-date').value = currentDate;
document.getElementById('attendance-date').addEventListener('change', (e) => {
    currentDate = e.target.value;
    renderAttendanceList();
});

// Initialization


const fetchStudents = async () => {
    studentsData = await getAllStudents();
};

// --- RENDERERS ---

const renderStats = () => {
    document.getElementById('total-students').textContent = studentsData.length;

    const dueCount = studentsData.filter(s => s.paymentStatus === 'DUE' || s.paymentStatus === 'PENDING_APPROVAL').length;
    document.getElementById('due-count').textContent = dueCount;

    // Calculate today's present count
    const present = studentsData.filter(s => s.attendance && s.attendance[currentDate] === 'P').length;
    document.getElementById('present-count').textContent = present;

    // Financials (Automated from Logs)
    // 1. Fetch Logs
    getPaymentLogs().then(logs => {
        // 2. Filter for Current Month (YYYY-MM)
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const currentMonthLogs = logs.filter(l => l.monthKey === currentMonthKey);
        const totalCollected = currentMonthLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);

        // 3. Update UI
        const colEl = document.getElementById('total-collected');
        if (colEl) colEl.textContent = formatCurrency(totalCollected);

        // Also update "Collected Today" separately if needed, or keep existing logic?
        // Existing logic used student.lastPaymentDate. Let's use Logs for that too for consistency!
        const todayStr = now.toISOString().split('T')[0];
        const todayLogs = logs.filter(l => l.date.startsWith(todayStr));
        const collectedToday = todayLogs.reduce((sum, log) => sum + (Number(log.amount) || 0), 0);

        const todayColEl = document.getElementById('collected-today');
        if (todayColEl) todayColEl.textContent = formatCurrency(collectedToday);
    });

    // Total Due (Remain from Students Data)
    const totalDue = studentsData.reduce((sum, s) => sum + (s.dueAmount || 0), 0);
    const dueEl = document.getElementById('total-due');
    if (dueEl) dueEl.textContent = formatCurrency(totalDue);



    renderLast7Days();

    // Notification Dot Logic (Safe)
    try {
        if (Array.isArray(studentsData)) {
            const pendingCount = studentsData.filter(s => s.paymentStatus === 'PENDING_APPROVAL').length;
            const notifyDot = document.getElementById('payment-notify-dot');
            if (notifyDot) {
                notifyDot.style.display = pendingCount > 0 ? 'block' : 'none';
            }
        }
    } catch (e) {
        console.warn("Error updating notification dot:", e);
    }
};

const renderLast7Days = () => {
    const tbody = document.getElementById('last-7-days-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Generate last 7 days dates
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }

    dates.forEach(date => {
        const count = studentsData.filter(s => s.attendance && s.attendance[date] === 'P').length;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(date)}</td>
            <td><strong>${count}</strong> Students</td>
        `;
        tbody.appendChild(tr);
    });
};

// --- SEARCH & FILTER ---
let searchQueryStudents = "";
let searchQueryAttendance = "";

const handleSearch = (query, type) => {
    if (type === 'students') {
        searchQueryStudents = query.toLowerCase();
        renderStudentList();
    } else if (type === 'attendance') {
        searchQueryAttendance = query.toLowerCase();
        renderAttendanceList();
    }
};

const filterData = (data, query) => {
    if (!query) return data;
    return data.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.phone.includes(query) ||
        s.accessCode.includes(query)
    );
};

const renderStudentList = () => {
    const tbody = document.getElementById('student-list-body');
    tbody.innerHTML = '';

    const filtered = filterData(studentsData, searchQueryStudents);

    filtered.forEach(student => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Student">
                <div class="student-card-btn" onclick="openStudentDetails('${student.id}')">
                    <div style="font-weight:700; font-size:1.05rem;">${student.name}</div>
                    <div style="font-size:0.8rem; opacity:0.8;">Joined: ${formatDate(student.joinDate)}</div>
                </div>
            </td>
            <td data-label="Access Code"><code>${student.accessCode}</code></td>
            <td data-label="Phone">${student.phone}</td>
            <td data-label="Fee (Due)">
                <div>${formatCurrency(student.monthlyFee)}</div>
                <div style="font-size:0.8em; color:var(--danger)">Due: ${formatCurrency(student.dueAmount)}</div>
            </td>
            <td data-label="Status"><span class="status ${getStatusClass(student.paymentStatus)}">${student.paymentStatus === 'PENDING_APPROVAL' ? 'Pending' : student.paymentStatus}</span></td>
            <td data-label="Actions" class="actions-cell">
                <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                    <button class="btn-icon btn-edit" onclick="handleEdit('${student.id}')" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="btn-icon btn-renew" onclick="handleRenew('${student.id}', ${student.monthlyFee})" title="Renew Fee">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    </button>
                    <button class="btn-icon btn-wa" onclick="sendWhatsapp('${student.phone}', '${student.name}', '${student.dueAmount}')" title="WhatsApp">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                    </button>
                    <button class="btn-icon btn-delete" onclick="handleDelete('${student.id}')" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            </td>
`;
        tbody.appendChild(tr);
    });
};

const renderAttendanceList = () => {
    const tbody = document.getElementById('attendance-list-body');
    tbody.innerHTML = '';

    const filtered = filterData(studentsData, searchQueryAttendance);

    filtered.forEach(student => {
        const status = (student.attendance && student.attendance[currentDate]) || ''; // 'P', 'A', or empty

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Student">${student.name}</td>
        <td data-label="Status">
            <div style="display:flex; gap:0.5rem;">
                <button class="btn btn-sm ${status === 'P' ? 'btn-primary' : 'btn-outline'}"
                    onclick="toggleAttendance('${student.id}', 'P')">P</button>
                <button class="btn btn-sm ${status === 'A' ? 'btn-danger' : 'btn-outline'}"
                    onclick="toggleAttendance('${student.id}', 'A')">A</button>
            </div>
        </td>
`;
        tbody.appendChild(tr);
    });
};

const renderPaymentList = () => {
    const tbody = document.getElementById('payment-list-body');
    tbody.innerHTML = '';

    // Filter only those with Due or Pending
    const dueStudents = studentsData.filter(s => s.paymentStatus !== 'PAID');

    dueStudents.forEach(student => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="Name">${student.name}</td>
            <td data-label="Due Amount">
                <div style="color:var(--danger)">${formatCurrency(student.dueAmount)}</div>
            </td>
            <td data-label="Next Due">${formatDate(student.nextDueDate)}</td>
            <td data-label="Action">
                <button class="btn btn-primary btn-sm" onclick="handleApprovePayment('${student.id}', ${student.dueAmount})">Approve Full</button>
            </td>
`;
        tbody.appendChild(tr);
    });
};

// --- HANDLERS ---

// Store temporary attendance changes in memory before saving?
// Or save immediately? The prompt says "Save attendance date-wise". 
// A "Save" button exists in my HTML. So let's store locally then save on click.
let tempAttendance = {};

window.toggleAttendance = async (id, status) => {
    tempAttendance[id] = status;
    // Update visual immediately
    const student = studentsData.find(s => s.id === id);
    if (!student.attendance) student.attendance = {};
    student.attendance[currentDate] = status;
    renderAttendanceList();
    renderStats(); // Update stats real-time
};

window.saveAttendance = async () => {
    try {
        const promises = Object.keys(tempAttendance).map(id => {
            return markAttendance(id, currentDate, tempAttendance[id]);
        });
        await Promise.all(promises);
        showToast('Attendance saved!', 'success');
        tempAttendance = {}; // clear temp
    } catch (error) {
        console.error(error);
        showToast('Error saving attendance', 'error');
    }
};

window.handleApprovePayment = async (id, amount) => {
    const student = studentsData.find(s => s.id === id);
    if (confirm('Approve payment of ' + formatCurrency(amount) + '?')) {
        await approvePayment(id, amount, student.name);
        await fetchStudents();
        renderPaymentList();
        renderStudentList();
        renderStats();
        showToast('Payment Approved', 'success');
    }
};

window.handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this student?')) {
        await deleteStudent(id);
        await fetchStudents();
        renderStudentList();
        showToast('Student deleted', 'success');
    }
};

window.handleRenew = async (id, currentFee) => {
    if (confirm(`Renew monthly fee for this student ? (Amount: ${currentFee})`)) {
        // Next month date
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + 30);

        try {
            await setStudentFee(id, currentFee, nextDue.toISOString());
            await fetchStudents();
            renderStudentList();
            renderStats();
            showToast('Fee Renewed! Student can now pay.', 'success');
        } catch (e) {
            console.error(e);
            showToast('Error renewing fee', 'error');
        }
    }
};

window.sendWhatsapp = (phone, name, due) => {
    const msg = `Hello ${name}, this is a reminder from KGF Gym.You have a due payment of Rs.${due}. Please pay at your earliest convenience.`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
};

// --- ADD STUDENT FORM ---

document.getElementById('add-student-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("Form submitted"); // DEBUG

    const name = document.getElementById('new-name').value;
    const phone = document.getElementById('new-phone').value;
    const fee = document.getElementById('new-fee').value;

    console.log("Values:", name, phone, fee); // DEBUG

    // Generate Random 6 digit access code
    const accessCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Setup Next Due Date (30 days from now)
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 30);

    const newStudent = {
        name,
        phone,
        monthlyFee: Number(fee),
        accessCode,
        nextDueDate: nextDue.toISOString(),
    };

    try {
        console.log("Attempting to add student to Firestore..."); // DEBUG
        await addStudent(newStudent);
        console.log("Success!"); // DEBUG
        showToast(`Student added! Access Code: ${accessCode}`, 'success');
        closeAddModal();
        e.target.reset();
        await init(); // refresh all
    } catch (err) {
        console.error("FULL ERROR OBJECT:", err); // DEBUG
        showToast('Error adding student: ' + err.message, 'error');
    }
});

window.handleEdit = (id) => {
    const student = studentsData.find(s => s.id === id);
    if (!student) return;

    document.getElementById('edit-id').value = student.id;
    document.getElementById('edit-name').value = student.name;
    document.getElementById('edit-phone').value = student.phone;
    document.getElementById('edit-fee').value = student.monthlyFee;
    document.getElementById('edit-due').value = student.dueAmount || 0;
    document.getElementById('edit-paid').value = student.paidAmount || 0;
    document.getElementById('edit-plan').value = student.planDetails || ''; // Load Plan

    // Populate Progress Logs
    const progressList = document.getElementById('edit-progress-list');
    progressList.innerHTML = '';
    if (student.progressLogs && student.progressLogs.length > 0) {
        // Sort DESC
        const logs = [...student.progressLogs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
        logs.forEach(log => {
            const hM = log.height / 100;
            const bmi = (log.weight / (hM * hM)).toFixed(1);
            const div = document.createElement('div');
            div.style.cssText = 'display:flex; justify-content:space-between; padding:0.25rem 0; border-bottom:1px solid rgba(255,255,255,0.1);';
            div.innerHTML = `
                <span>${formatDate(log.date)}</span>
                <span>${log.weight}kg / ${bmi} BMI</span>
            `;
            progressList.appendChild(div);
        });
    } else {
        progressList.innerHTML = '<div class="text-muted">No logs available.</div>';
    }

    // Populate Date (handle ISO string)
    if (student.nextDueDate) {
        document.getElementById('edit-next-due').value = student.nextDueDate.split('T')[0];
    }

    openEditModal();
};

document.getElementById('edit-student-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('edit-id').value;
    const updates = {
        name: document.getElementById('edit-name').value,
        phone: document.getElementById('edit-phone').value,
        monthlyFee: Number(document.getElementById('edit-fee').value),
        dueAmount: Number(document.getElementById('edit-due').value),
        paidAmount: Number(document.getElementById('edit-paid').value),
        planDetails: document.getElementById('edit-plan').value, // Save Plan
        nextDueDate: new Date(document.getElementById('edit-next-due').value).toISOString(),

        // Update status based on due amount?
        paymentStatus: Number(document.getElementById('edit-due').value) > 0 ? 'DUE' : 'PAID'
    };

    try {
        await updateStudent(id, updates);
        showToast('Student updated successfully', 'success');
        closeEditModal();
        await fetchStudents();
        renderStudentList();
        renderStats();
        renderAlerts(); // Update alerts
    } catch (err) {
        console.error(err);
        showToast('Error updating student', 'error');
    }
});

// Auto-calculate Due Amount
const calculateDue = () => {
    const fee = Number(document.getElementById('edit-fee').value) || 0;
    const paid = Number(document.getElementById('edit-paid').value) || 0;
    // Default logic: Due = Fee - Paid. 
    // If Paid > Fee, Due = 0 (or negative if overpaid?) -> Let's keep it simple: Fee - Paid.
    document.getElementById('edit-due').value = fee - paid;
};

document.getElementById('edit-fee').addEventListener('input', calculateDue);
document.getElementById('edit-paid').addEventListener('input', calculateDue);

// Utils
const getStatusClass = (status) => {
    if (status === 'PAID') return 'status-paid';
    if (status === 'DUE') return 'status-due';
    return 'status-pending';
};

// --- SETTINGS FORM ---



const fetchSettings = async () => {
    try {
        const settings = await getPaymentSettings();
        const upiEl = document.getElementById('setting-upi');
        const phoneEl = document.getElementById('setting-phone');
        if (upiEl) upiEl.value = settings.upiId || '';
        if (phoneEl) phoneEl.value = settings.adminPhone || '';
    } catch (e) { console.log('Settings fetch error', e); }
};

const renderAlerts = () => {
    const container = document.getElementById('admin-alerts');
    if (!container) return;
    container.innerHTML = '';

    const todayStr = new Date().toISOString().split('T')[0];

    studentsData.forEach(s => {
        if (s.dueAmount > 0 && s.nextDueDate && s.nextDueDate.startsWith(todayStr)) {
            const alert = document.createElement('div');
            alert.className = 'card';
            alert.style.cssText = `
                background-color: rgba(239, 68, 68, 0.1); 
                border: 1px solid var(--danger); 
                color: var(--danger);
                padding: 1rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0;
            `;
            alert.innerHTML = `
                <div>
                    <strong>Payment Due Today:</strong> ${s.name} has to pay ${formatCurrency(s.dueAmount)}
                </div>
                <button class="btn btn-sm btn-danger" onclick="sendWhatsapp('${s.phone}', '${s.name}', '${s.dueAmount}')">Remind</button>
            `;
            container.appendChild(alert);
        }
    });
};

// Boot
const init = async () => {
    await fetchStudents();
    await fetchSettings(); // Load Default Settings
    renderStats();
    renderAlerts(); // New Features
    renderStudentList();
    renderAttendanceList();
    renderPaymentList();
    renderAnnouncements();
};

/* --- ANNOUNCEMENTS LOGIC --- */
const renderAnnouncements = async () => {
    const list = document.getElementById('announcement-list-body');
    if (!list) return;
    list.innerHTML = '<div class="text-muted">Loading...</div>';

    const announcements = await getAnnouncements();
    list.innerHTML = '';

    if (announcements.length === 0) {
        list.innerHTML = '<div class="text-muted">No announcements posted.</div>';
        return;
    }

    announcements.forEach(a => {
        const item = document.createElement('div');
        item.className = 'card';
        item.style.cssText = 'padding:0.75rem; margin-bottom:0; display:flex; justify-content:space-between; align-items:flex-start;';
        item.innerHTML = `
            <div>
                <div style="font-weight:500;">${a.message}</div>
                <div style="font-size:0.8em; color:var(--text-muted); margin-top:0.25rem;">
                    Posted: ${formatDate(a.date)}
                </div>
            </div>
            <div style="display:flex; gap:0.5rem;">
                <button class="btn-icon btn-edit" onclick="handleEditAnnouncement('${a.id}', '${a.message.replace(/'/g, "\\'")}')" title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-icon btn-delete" onclick="handleDeleteAnnouncement('${a.id}')" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;
        list.appendChild(item);
    });
};

// --- ANNOUNCEMENT MODAL HANDLERS ---
window.openAnnouncementModal = (id = null, message = '') => {
    const modal = document.getElementById('announcement-modal');
    const title = document.getElementById('announcement-modal-title');
    const input = document.getElementById('modal-announcement-input');
    const idInput = document.getElementById('modal-announcement-id');

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    if (id) {
        // Edit Mode
        title.textContent = "Edit Notice";
        input.value = message;
        idInput.value = id;
    } else {
        // Create Mode
        title.textContent = "Post New Notice";
        input.value = '';
        idInput.value = '';
    }
    input.focus();
};

window.closeAnnouncementModal = () => {
    const modal = document.getElementById('announcement-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
};

window.handleSaveAnnouncement = async () => {
    const input = document.getElementById('modal-announcement-input');
    const idInput = document.getElementById('modal-announcement-id');
    const msg = input.value.trim();
    if (!msg) {
        showToast('Please enter a message', 'error');
        return;
    }

    try {
        if (idInput.value) {
            await updateAnnouncement(idInput.value, msg);
            showToast('Announcement Updated!', 'success');
        } else {
            await addAnnouncement(msg);
            showToast('Announcement Posted!', 'success');
        }
        closeAnnouncementModal();
        renderAnnouncements();
    } catch (e) {
        console.error(e);
        showToast('Error saving announcement', 'error');
    }
};

window.handleEditAnnouncement = (id, msg) => {
    openAnnouncementModal(id, msg);
};

window.handleDeleteAnnouncement = async (id) => {
    if (confirm('Delete this announcement?')) {
        await deleteAnnouncement(id);
        renderAnnouncements();
        showToast('Announcement deleted', 'success');
    }
};

// --- PAYMENT HISTORY (AUTOMATED) ---
// --- PAYMENT HISTORY (PAGE) ---
window.renderHistorySection = async () => {
    const tbody = document.getElementById('history-section-body');
    const monthSelect = document.getElementById('history-month-select');
    const totalEl = document.getElementById('history-month-total');
    const countEl = document.getElementById('history-month-count');

    if (!tbody) return;

    // Only show loading if table is empty (first load), otherwise keep showing old data while refreshing
    if (tbody.children.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
    }

    try {
        const logs = await getPaymentLogs(); // Returns all logs sorted by timestamp desc

        // 1. Extract Unique Months & Sort Descending (Newest First)
        let months = [...new Set(logs.map(log => log.monthKey))];
        months.sort().reverse();

        // 2. Smart Dropdown Update (Only rebuild if changed)
        const currentOptions = Array.from(monthSelect.options).map(o => o.value).filter(v => v);
        const hasChanged = JSON.stringify(currentOptions) !== JSON.stringify(months);

        let selectedMonth = monthSelect.value;

        // If nothing selected or selection invalid/empty, default to newest month
        if (!selectedMonth || (months.length > 0 && !months.includes(selectedMonth))) {
            selectedMonth = months.length > 0 ? months[0] : '';
        }

        if (hasChanged) {
            monthSelect.innerHTML = '';
            if (months.length === 0) {
                monthSelect.innerHTML = '<option value="">No Data</option>';
            } else {
                months.forEach(m => {
                    // Calculate Total for this month
                    const mLogs = logs.filter(l => l.monthKey === m);
                    const mTotal = mLogs.reduce((sum, l) => sum + Number(l.amount), 0);

                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = `${m} (₹${mTotal})`; // e.g. "2025-12 (₹1000)"
                    monthSelect.appendChild(opt);
                });
            }
        }

        // Restore/Ensure Selection
        if (selectedMonth) {
            monthSelect.value = selectedMonth;
        }

        // Handle "empty" state if no logs
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3">No history recorded yet.</td></tr>';
            totalEl.innerText = '₹0';
            countEl.innerText = '0';
            return;
        }

        // 3. Filter Logs by Selected Month
        // Read fresh value from DOM in case we just set it or user changed it
        selectedMonth = monthSelect.value;

        const filteredLogs = logs.filter(log => log.monthKey === selectedMonth);

        // 4. Calculate Stats
        const total = filteredLogs.reduce((sum, log) => sum + Number(log.amount), 0);
        const count = filteredLogs.length;

        totalEl.innerText = formatCurrency(total);
        countEl.innerText = count;

        // 5. Render Rows
        tbody.innerHTML = '';
        if (filteredLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3">No payments in this month.</td></tr>';
            return;
        }

        // Sort by date desc (latest first) relative to the month
        filteredLogs.sort((a, b) => b.timestamp - a.timestamp);

        filteredLogs.forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatDate(log.date)}</td>
                <td>${log.studentName || 'Unknown'}</td>
                <td style="font-weight:bold; color:var(--success)">${formatCurrency(log.amount)}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (e) {
        console.error("Error loading history:", e);
        tbody.innerHTML = '<tr><td colspan="3" style="color:var(--danger)">Error loading history.</td></tr>';
    }
};

window.closeHistoryModal = () => {
    // Deprecated but keeping safe to avoid breakage if ref exists
    const el = document.getElementById('history-modal');
    if (el) { el.classList.add('hidden'); el.style.display = 'none'; }
};

window.init = init; // Expose for Refresh button

// Search Listeners
const searchStudentInput = document.getElementById('search-students');
const searchAttendanceInput = document.getElementById('search-attendance');

if (searchStudentInput) {
    searchStudentInput.addEventListener('input', (e) => {
        handleSearch(e.target.value, 'students');
    });
}

if (searchAttendanceInput) {
    searchAttendanceInput.addEventListener('input', (e) => {
        handleSearch(e.target.value, 'attendance');
    });
}

init();

window.sendWhatsapp = sendWhatsapp;

// --- STUDENT DETAILS MODAL (MOBILE) ---

// --- STUDENT DETAILS MODAL (MOBILE) ---
window.openStudentDetails = (id) => {
    const student = studentsData.find(s => s.id === id);
    if (!student) return;

    // Populate Modal
    document.getElementById('detail-name').textContent = student.name;
    document.getElementById('detail-code').textContent = student.accessCode;
    document.getElementById('detail-phone').textContent = student.phone;
    document.getElementById('detail-fee').textContent = formatCurrency(student.monthlyFee);
    document.getElementById('detail-due').textContent = formatCurrency(student.dueAmount || 0);
    document.getElementById('detail-joined').textContent = formatDate(student.joinDate);

    // Status Badge
    const statusEl = document.getElementById('detail-status');
    statusEl.textContent = student.paymentStatus || 'PENDING';
    statusEl.className = `status ${getStatusClass(student.paymentStatus)}`;

    // Action Buttons
    const btnWa = document.getElementById('btn-detail-wa');
    const btnEdit = document.getElementById('btn-detail-edit');
    const btnRenew = document.getElementById('btn-detail-renew');
    const btnDelete = document.getElementById('btn-detail-delete');

    // Clone & Replace to remove old listeners (simple way)
    // Or just set ononclick
    btnWa.onclick = () => sendWhatsapp(student.phone, student.name, student.dueAmount);
    btnEdit.onclick = () => { closeStudentDetailsModal(); handleEdit(student.id); };
    btnRenew.onclick = () => { closeStudentDetailsModal(); handleRenew(student.id, student.monthlyFee); };
    btnDelete.onclick = () => { closeStudentDetailsModal(); handleDelete(student.id); };

    // Show Modal
    const modal = document.getElementById('student-details-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.closeStudentDetailsModal = () => {
    const modal = document.getElementById('student-details-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
};

window.switchSection = (sectionName) => {
    // Hide all
    const sections = ['students', 'attendance', 'payments', 'announcements', 'settings', 'history'];
    sections.forEach(s => {
        const el = document.getElementById('section-' + s);
        if (el) el.classList.add('hidden');
    });

    // Show clicked
    const target = document.getElementById(`section-${sectionName}`);
    if (target) target.classList.remove('hidden');

    // Update Tabs
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(t => t.classList.remove('active'));

    // Find active tab and set class (simple text match)
    tabs.forEach(t => {
        if (t.innerText.toLowerCase().includes(sectionName)) t.classList.add('active');
    });

    // Render Logic
    if (sectionName === 'announcements') renderAnnouncements();
    if (sectionName === 'history') renderHistorySection();
};
