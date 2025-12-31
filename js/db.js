import { db } from './firebase-config.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// --- STUDENT MANAGEMENT ---

export const addStudent = async (studentData) => {
    try {
        const docRef = await addDoc(collection(db, "students"), {
            ...studentData,
            joinDate: new Date().toISOString(),
            paidAmount: 0,
            dueAmount: studentData.monthlyFee, // Initially due
            paymentStatus: 'DUE',
            lastUpdated: new Date().toISOString()
        });
        return docRef.id;
    } catch (e) {
        console.error("Error adding student: ", e);
        throw e;
    }
};

export const getAllStudents = async () => {
    const sn = await getDocs(collection(db, "students"));
    return sn.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const updateStudent = async (id, updates) => {
    const ref = doc(db, "students", id);
    await updateDoc(ref, updates);
};

export const deleteStudent = async (id) => {
    await deleteDoc(doc(db, "students", id));
};

// --- ATTENDANCE ---

export const markAttendance = async (studentId, date, status) => {
    const ref = doc(db, "students", studentId);
    // Use dot notation to update map field 'attendance.2023-10-01'
    await updateDoc(ref, {
        [`attendance.${date}`]: status
    });
};

// --- PAYMENTS ---

// --- PAYMENT LOGGING ---
export const logPayment = async (paymentData) => {
    // paymentData: { studentId, studentName, amount, date: ISOString, monthKey: "YYYY-MM" }
    try {
        await addDoc(collection(db, "payment_logs"), {
            ...paymentData,
            timestamp: Date.now()
        });
    } catch (e) {
        console.error("Error logging payment:", e);
    }
};

export const getPaymentLogs = async () => {
    try {
        const q = query(collection(db, "payment_logs"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error("Error fetching payment logs:", e);
        return [];
    }
};

// --- PAYMENTS ---

export const approvePayment = async (studentId, amount, studentName) => {
    const ref = doc(db, "students", studentId);
    const paymentDate = new Date();

    // 1. Update Student Record
    await updateDoc(ref, {
        paymentStatus: 'PAID',
        dueAmount: 0,
        paidAmount: amount,
        lastPaymentDate: paymentDate.toISOString()
    });

    // 2. Log Transaction for History
    const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
    await logPayment({
        studentId,
        studentName: studentName || "Unknown", // Pass name if possible, else fetch
        amount: Number(amount),
        date: paymentDate.toISOString(),
        monthKey: monthKey
    });
};

export const setStudentFee = async (studentId, fee, nextDueDate) => {
    const ref = doc(db, "students", studentId);
    await updateDoc(ref, {
        monthlyFee: fee,
        dueAmount: fee, // Reset due amount to full fee
        paymentStatus: 'DUE',
        nextDueDate: nextDueDate
    });
};

export const markStudentPaymentPending = async (studentId) => {
    const ref = doc(db, "students", studentId);
    await updateDoc(ref, {
        paymentStatus: 'PENDING_APPROVAL'
    });
};


// --- SETTINGS (UPI) ---
export const getPaymentSettings = async () => {
    try {
        const docRef = doc(db, "settings", "payment");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            return { upiId: "gym@upi", adminPhone: "" };
        }
    } catch (e) {
        console.error("Settings Fetch Error", e);
        return { upiId: "", adminPhone: "" };
    }
};

export const updatePaymentSettings = async (upiId, adminPhone) => {
    const docRef = doc(db, "settings", "payment");
    await setDoc(docRef, { upiId, adminPhone }, { merge: true });
};

// --- ANNOUNCEMENTS ---
export const addAnnouncement = async (message) => {
    try {
        const docRef = await addDoc(collection(db, "announcements"), {
            message,
            date: new Date().toISOString(),
            timestamp: Date.now()
        });
        return docRef.id;
    } catch (e) {
        console.error("Error adding announcement: ", e);
        throw e;
    }
};

export const getAnnouncements = async () => {
    try {
        const sn = await getDocs(collection(db, "announcements"));
        // Sort by timestamp desc
        return sn.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
        console.error("Error fetching announcements: ", e);
        return [];
    }
};

export const deleteAnnouncement = async (id) => {
    await deleteDoc(doc(db, "announcements", id));
};

export const updateAnnouncement = async (id, message) => {
    const ref = doc(db, "announcements", id);
    await updateDoc(ref, {
        message: message,
        timestamp: Date.now()
    });
};

// --- PROGRESS TRACKER ---
export const addProgressLog = async (studentId, logData) => {
    const ref = doc(db, "students", studentId);
    // We use arrayUnion to add to the 'progressLogs' array
    // Import arrayUnion first? Or just read-modify-write?
    // Firestore arrayUnion is better.
    // Let's assume we import arrayUnion from firebase-firestore.js at the top?
    // If not, we can read, append, update. Read-modify-write is safer if we don't have arrayUnion imported yet.
    // Let's check imports.

    const snap = await getDoc(ref);
    if (snap.exists()) {
        const data = snap.data();
        const logs = data.progressLogs || [];
        logs.push({ ...logData, id: Date.now().toString() }); // Add unique ID for deletion if needed
        await updateDoc(ref, { progressLogs: logs });
    }
};

export const deleteProgressLog = async (studentId, logId) => {
    const ref = doc(db, "students", studentId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        const data = snap.data();
        const logs = data.progressLogs || [];
        const newLogs = logs.filter(l => l.id !== logId);
        await updateDoc(ref, { progressLogs: newLogs });
    }
};

export const updateProgressLog = async (studentId, logId, updatedData) => {
    const ref = doc(db, "students", studentId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        const data = snap.data();
        let logs = data.progressLogs || [];
        const index = logs.findIndex(l => l.id === logId);
        if (index !== -1) {
            logs[index] = { ...logs[index], ...updatedData };
            await updateDoc(ref, { progressLogs: logs });
        }
    }
};


