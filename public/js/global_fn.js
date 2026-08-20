
/**
 * Global SweetAlert2 Helper Functions
 */

// Show Success Message (Auto close)
function showSuccess(title, text = '') {
    Swal.fire({
        icon: 'success',
        title: title,
        html: text,
        timer: 1500,
        showConfirmButton: false
    });
}

// Show Warning Message
function showWarning(title, text = '') {
    Swal.fire({
        icon: 'warning',
        title: title,
        html: text,
        confirmButtonColor: '#ffc107',
        confirmButtonText: 'OK'
    });
}

// Show Error Message
function showError(title, text = '') {
    Swal.fire({
        icon: 'error',
        title: title,
        html: text,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Close'
    });
}

// Show Confirmation Dialog
async function showConfirm(title, text = '', confirmBtnText = 'Yes, confirm it!') {
    const result = await Swal.fire({
        title: title,
        html: text,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: confirmBtnText
    });
    return result.isConfirmed;
}

// Show Info Message
function showInfo(title, text = '') {
    Swal.fire({
        icon: 'info',
        title: title,
        html: text,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'OK'
    });
}

// Show Warning with custom HTML (for tables, rich content)
function showWarningHtml(title, htmlContent, options = {}) {
    Swal.fire({
        icon: 'warning',
        title: title,
        html: htmlContent,
        confirmButtonColor: options.confirmButtonColor || '#dc2626',
        confirmButtonText: 'OK',
        width: options.width || undefined
    });
}