export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

export const formatDate = (dateString) => {
    if (!dateString) return '-';
    // Handle both ISO strings and YYYY-MM-DD
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // fallback

    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(date);
};

export const showToast = (message, type = 'info') => {
    // Check if container exists
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 1rem;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.textContent = message;

    // Toast colors
    let bg = '#333';
    if (type === 'success') bg = '#10b981';
    if (type === 'error') bg = '#ef4444';

    toast.style.cssText = `
        background: ${bg};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        min-width: 250px;
        animation: slideIn 0.3s ease-out;
    `;

    container.appendChild(toast);

    // Remove
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// Add animation keyframe
const style = document.createElement('style');
style.innerHTML = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);
