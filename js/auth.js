import { db } from './firebase-config.js';
// We are switching to Passcode auth, so we don't need Firebase Auth imports for Admin anymore
// But we still need Firebase Auth for Student if they use it (though current student logic is custom too)
import { collection, query, where, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { showToast } from './utils.js';

// ... (existing code)

export const logout = async () => {
    localStorage.removeItem('kgf_admin_token');
    localStorage.removeItem('kgf_student'); // Keep student logout for consistency
    window.location.href = '../index.html';
};

// Check if admin is logged in (Passcode Token)
export const checkAdminAuth = () => {
    const token = localStorage.getItem('kgf_admin_token');
    if (token !== 'valid') {
        window.location.href = '../index.html';
    }
};

export const loginWithPasscode = async (passcode) => {
    try {
        const docRef = doc(db, "settings", "auth");
        const docSnap = await getDoc(docRef);

        let correctCode = "123456"; // Default fallback
        if (docSnap.exists()) {
            correctCode = docSnap.data().adminPasscode || "123456";
        } else {
            // Create default if not exists
            await setDoc(docRef, { adminPasscode: "123456" });
        }

        if (passcode === correctCode) {
            localStorage.setItem('kgf_admin_token', 'valid');
            window.location.href = 'admin/dashboard.html';
            return true;
        } else {
            return false;
        }
    } catch (e) {
        console.error("Login Error:", e);
        throw e;
    }
};

export const updateAdminPasscode = async (currentPasscode, newPasscode) => {
    const docRef = doc(db, "settings", "auth");
    const docSnap = await getDoc(docRef);
    let correctCode = "123456";

    if (docSnap.exists()) {
        correctCode = docSnap.data().adminPasscode;
    }

    if (currentPasscode !== correctCode) {
        throw new Error("Incorrect Current Passcode");
    }

    await setDoc(docRef, { adminPasscode: newPasscode }, { merge: true });
    return "Passcode Updated Successfully!";
};

// --- ADMIN AUTH ---

// --- ADMIN AUTH (Passcode) ---

const adminLoginForm = document.getElementById('admin-login-form');
if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const passcode = document.getElementById('admin-passcode').value.trim();

        try {
            const success = await loginWithPasscode(passcode);
            if (!success) {
                showToast('Invalid Passcode', 'error');
            }
        } catch (error) {
            console.error(error);
            showToast('Login Error', 'error');
        }
    });
}
// checkAdminAuth is now manual export above

// --- STUDENT AUTH (Custom Logic) ---

const studentLoginForm = document.getElementById('student-login-form');
if (studentLoginForm) {
    studentLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('student-name').value.trim();
        const code = document.getElementById('access-code').value.trim();

        if (code.length !== 6) {
            showToast("Enter a valid 6-digit code", "error");
            return;
        }

        try {
            const studentsRef = collection(db, "students");
            // Basic query: name AND accessCode
            // Note: In production, names might not be unique. This is MVP logic.
            const q = query(studentsRef, where("accessCode", "==", code));

            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                showToast("Invalid Credentials", "error");
                return;
            }

            let found = false;
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.name.trim().toLowerCase() === name.toLowerCase()) {
                    // Success!
                    localStorage.setItem('kgf_student', JSON.stringify({ id: doc.id, ...data }));
                    window.location.href = 'student/dashboard.html';
                    found = true;
                }
            });

            if (!found) showToast("Name does not match Code", "error");

        } catch (e) {
            console.error(e);
            showToast("Login Error", "error");
        }
    });
}

// Checkers
export const checkStudentAuth = () => {
    const student = localStorage.getItem('kgf_student');
    if (!student) {
        window.location.href = '../index.html';
        return null;
    }
    return JSON.parse(student);
};
