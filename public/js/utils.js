const formatter = new Intl.NumberFormat('en-US');

var loginUser = {
    uid: '',
    firstname: '',
    lastname: '',
    department: '',
    hasLogin: false
}

async function setUser(user) {
    return new Promise((resolve, reject) => {
        if (user !== undefined && user !== null) {
            loginUser.uid = user.uid;
            loginUser.firstname = user.firstname;
            loginUser.lastname = user.lastname;
            loginUser.department = user.department;
            loginUser.hasLogin = true;
        } else {
            loginUser.uid = '';
            loginUser.firstname = '';
            loginUser.lastname = '';
            loginUser.department = '';
            loginUser.hasLogin = false;
        }

        localStorage.setItem('loginUser', JSON.stringify(loginUser));
        resolve();
    });
}

async function getLoginUser() {
    return new Promise((resolve, reject) => {
        let user = localStorage.getItem('loginUser');
        if (user !== null) {
            loginUser = JSON.parse(user);
        }
        resolve(loginUser);
    });
}

function showSuccessMessage(message) {
    Swal.fire({
        icon: "success",
        title: "success",
        text: message,
    });
}

function showWarningMessage(message) {
    Swal.fire({
        icon: "warning",
        title: "Warning",
        text: message,
    });
}

function showErrorMessage(message) {
    Swal.fire({
        icon: "error",
        title: "Oops...",
        text: message,
    });
}

function showLoading() {
    swalLoading = Swal.fire({
        title: 'กำลังโหลดข้อมูล',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading()
        }
    })
}

function closeLoading() {
    swalLoading.close();
}

function showToast(message = 'บันทึกสำเร็จ', icon = 'success') {
    // Toast แบบพื้นฐาน
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: icon,
        title: message,
        showConfirmButton: false,
        timer: 3000,
    });
}

function checkNumberOnly(value) {
    return /^[0-9]+$/.test(value);
}

function showNumber(value) {
    return formatter.format(value);
}

/* --- ZPL Generators --- */

/**
 * Generates ZPL for Racking/Freezer labels (Original Layout: Full Bleed/Fixed Template).
 * @param {Array} racks - Array of items {name: '...'}
 * @param {number} offset - 0 = Top, 1 = Bottom (Zig-Zag Pattern)
 * @returns {string} ZPL Commands
 */
function generateRackingZPL(racks, offset = 0) {
    // --- Manual Y-Offset Adjustment ---
    const manualOffsetY = 20;

    // Calculate Grid Y positions based on original template
    const y_top = 10 + manualOffsetY;
    const y_line1 = 748 + manualOffsetY;
    const y_line2 = 1496 + manualOffsetY;
    const y_line3 = 2244 + manualOffsetY;
    const y_line4 = 2992 + manualOffsetY;
    const y_line5 = 3740 + manualOffsetY;

    let zpl = `^XA
^CI28
^PR6,6
^MD15
^PW2126
^LL4488
^LS0

/* --- 1. Grid (Original Template) --- */
^FO0,${y_top}^GB2126,4488,8^FS
^FO1063,${y_top}^GB8,4488,8^FS
/* Horizontal Lines */
^FO0,${y_line1}^GB2126,8,8^FS
^FO0,${y_line2}^GB2126,8,8^FS
^FO0,${y_line3}^GB2126,8,8^FS
^FO0,${y_line4}^GB2126,8,8^FS
^FO0,${y_line5}^GB2126,8,8^FS

/* --- 2. Content --- */
`;

    // Defined Slot Coordinates from Template
    const rights = [
        { num: 1085, qr: 1280, text: 1600 },
        { num: 1085, qr: 1280, text: 1600 },
        { num: 1085, qr: 1280, text: 1600 },
        { num: 1085, qr: 1280, text: 1600 },
        { num: 1085, qr: 1280, text: 1600 },
        { num: 1085, qr: 1280, text: 1600 }
    ];
    const lefts = [
        { num: 20, qr: 217, text: 537 },
        { num: 20, qr: 217, text: 537 },
        { num: 20, qr: 217, text: 537 },
        { num: 20, qr: 217, text: 537 },
        { num: 20, qr: 217, text: 537 },
        { num: 20, qr: 217, text: 537 }
    ];

    const rowY = [20, 768, 1516, 2264, 3012, 3760].map(y => y + manualOffsetY);

    // Master Map (Zig-Zag Logic)
    const physicalSlots = [];
    rowY.forEach((y, i) => {
        physicalSlots.push({
            num: { x: rights[i].num, y: y },
            qr: { x: rights[i].qr, y: y + 235 },
            text: { x: rights[i].text, y: y + 175 }
        });
    });
    rowY.forEach((y, i) => {
        physicalSlots.push({
            num: { x: lefts[i].num, y: y },
            qr: { x: lefts[i].qr, y: y + 235 },
            text: { x: lefts[i].text, y: y + 175 }
        });
    });

    const patternTop = [0, 7, 2, 9, 4, 11];
    const patternBot = [6, 1, 8, 3, 10, 5];
    const currentPattern = (offset === 1) ? patternBot : patternTop;

    for (let i = 0; i < currentPattern.length; i++) {
        const targetPhysicalIdx = currentPattern[i];
        const s = physicalSlots[targetPhysicalIdx];
        const rackIndex = i;

        if (rackIndex < racks.length) {
            const rack = racks[rackIndex];
            const orderNum = rackIndex + 1;
            zpl += `
/* Slot ${i + 1} */
^FO${s.num.x},${s.num.y}^A0R,50,50^FD${orderNum}^FS
^FO${s.qr.x},${s.qr.y}^BQR,2,10^FDQA,${rack.name}^FS
^FO${s.text.x},${s.text.y}^A0R,120,120^FD${rack.name}^FS
`;
        }
    }

    zpl += `^XZ`;
    return zpl;
}

/**
 * Generates ZPL for Racking/Freezer labels (New Layout: 5mm Margins).
 * @param {Array} racks - Array of items {name: '...'}
 * @param {number} offset - 0 = Top, 1 = Bottom (Zig-Zag Pattern)
 * @returns {string} ZPL Commands
 */
function generateRackingZPLWithMargin(racks, offset = 0) {
    // --- Manual Y-Offset Adjustment ---
    const manualOffsetY = 0;

    // 5mm = ~118 dots
    const margin = 118;

    const y_start = margin + manualOffsetY;
    const x_start = margin;

    const content_width = 2126 - (margin * 2);
    const col_width = content_width / 2;
    const content_height = 4488 - (margin * 2);
    const row_height = content_height / 6;

    const x_mid = x_start + col_width;

    const y_line0 = y_start;
    const y_line1 = y_start + row_height;
    const y_line2 = y_start + (row_height * 2);
    const y_line3 = y_start + (row_height * 3);
    const y_line4 = y_start + (row_height * 4);
    const y_line5 = y_start + (row_height * 5);

    const padding_x = 20;
    const padding_y = 20;

    const qr_offset_x = 197;
    const qr_offset_y = 235;
    const text_offset_x = 517;
    const text_offset_y = 175;

    let zpl = `^XA
^CI28
^PR6,6
^MD15
^PW2126
^LL4488
^LS0

/* --- 1. Grid (5mm Margins) --- */
^FO${x_start},${y_line0}^GB${content_width},${content_height},8^FS
^FO${x_mid},${y_start}^GB8,${content_height},8^FS
/* Horizontal Lines */
^FO${x_start},${y_line1}^GB${content_width},8,8^FS
^FO${x_start},${y_line2}^GB${content_width},8,8^FS
^FO${x_start},${y_line3}^GB${content_width},8,8^FS
^FO${x_start},${y_line4}^GB${content_width},8,8^FS
^FO${x_start},${y_line5}^GB${content_width},8,8^FS

/* --- 2. Content --- */
`;

    const x_col1 = x_start + padding_x;
    const x_col2 = x_mid + padding_x;

    const rights = [];
    const lefts = [];
    const row_bases = [y_line0, y_line1, y_line2, y_line3, y_line4, y_line5];

    row_bases.forEach(y_base => {
        rights.push({
            num: x_col2,
            qr: x_col2 + qr_offset_x,
            text: x_col2 + text_offset_x
        });
    });
    row_bases.forEach(y_base => {
        lefts.push({
            num: x_col1,
            qr: x_col1 + qr_offset_x,
            text: x_col1 + text_offset_x
        });
    });

    const rowY = row_bases.map(y => y + padding_y);
    const physicalSlots = [];

    rowY.forEach((y, i) => {
        physicalSlots.push({
            num: { x: rights[i].num, y: y },
            qr: { x: rights[i].qr, y: y + qr_offset_y },
            text: { x: rights[i].text, y: y + text_offset_y }
        });
    });
    rowY.forEach((y, i) => {
        physicalSlots.push({
            num: { x: lefts[i].num, y: y },
            qr: { x: lefts[i].qr, y: y + qr_offset_y },
            text: { x: lefts[i].text, y: y + text_offset_y }
        });
    });

    const patternTop = [0, 7, 2, 9, 4, 11];
    const patternBot = [6, 1, 8, 3, 10, 5];
    const currentPattern = (offset === 1) ? patternBot : patternTop;

    for (let i = 0; i < currentPattern.length; i++) {
        const targetPhysicalIdx = currentPattern[i];
        const s = physicalSlots[targetPhysicalIdx];
        const rackIndex = i;

        if (rackIndex < racks.length) {
            const rack = racks[rackIndex];
            const orderNum = rackIndex + 1;
            zpl += `
/* Slot ${i + 1} */
^FO${s.num.x},${s.num.y}^A0R,50,50^FD${orderNum}^FS
^FO${s.qr.x},${s.qr.y}^BQR,2,10^FDQA,${rack.name}^FS
^FO${s.text.x},${s.text.y}^A0R,120,120^FD${rack.name}^FS
`;
        }
    }

    zpl += `^XZ`;
    return zpl;
}

/**
 * Generates ZPL for Freezer labels (Single Large Label, Centered 5mm Margin, Rotated).
 * @param {string} freezerName - Name of the freezer
 * @returns {string} ZPL Commands
 */
function generateFreezerZPLWithMargin(freezerName) {
    // Label dimensions
    const width = 2126;
    const height = 4488;
    const margin = 118; // 5mm

    let zpl = `^XA
^CI28
^JMA
^PR6,6
^MD15
^PW${width}
^LL${height}
^LS0
`;

    if (freezerName) {
        // --- CODE 128 BARCODE for Zebra 96 XIII Plus (600 DPI) ---
        // Using Barcode instead of QR for better scalability at high DPI

        // 1. TEXT (Freezer Name) - Left section
        // Font: 700x700 dots, rotated 90 degrees, centered
        zpl += `^FO250,0^A0R,700,700^FB${height},1,0,C,0^FD${freezerName}^FS`;

        // 2. CODE 128 BARCODE - Right section, LARGE
        // ^BY: Bar Width Module (10 = very wide for 600 DPI), Ratio (3:1), Height (N/A for ^BC)
        // ^BCR: Code 128, Rotated 90°, Height 1500 dots, Print Interpretation (Y=Yes), Above/Below (N,N)
        // Bar width 10 + height 1500 = Very large barcode
        zpl += `^BY10,3,0^FO1200,1494^BCR,1500,Y,N,N^FD${freezerName}^FS`;
    }

    zpl += `^XZ\n`;
    return zpl;
}

/**
 * Generates ZPL for Rack Name Only Label
 * - SOLID Black Triangle (Guaranteed to work on all Zebra printers)
 * - Ends with 'A': Point LEFT (◄)
 * - Otherwise: Point RIGHT (►)
 */
function generateRackNameOnlyZPL(rackName) {
    const width = 2126;
    const height = 4488;

    let zpl = `^XA
^PR6,6
^MD15
^PW${width}
^LL${height}
^LS0
`;

    if (rackName) {
        // 1. พิมพ์ชื่อ Rack (แนวตั้ง)
        zpl += `^FO663,400^A0R,800,800^FB3200,1,0,C,0^FD${rackName}^FS\n`;

        // 2. วาดสามเหลี่ยมทึบด้วยเทคนิค Line Stacking (ไม่มีตัวต่างดาว 100%)
        const triW = 540;  // ความกว้างของสามเหลี่ยม
        const triH = 540;  // ความสูง (ตามแนวตั้งของป้าย)
        const startY = 3200; 
        const centerX = 1250; 
        const startX = centerX - (triW / 2);

        const isLeft = rackName.endsWith('A');
        const numLines = 40; // จำนวนชั้นในการถมดำ (ยิ่งเยอะยิ่งเนียน)
        const lineH = triH / numLines;

        for (let i = 0; i < numLines; i++) {
            // คำนวณความกว้างของแต่ละชั้นเพื่อให้เป็นรูปสามเหลี่ยม
            let currentW;
            if (i < numLines / 2) {
                currentW = (triW / (numLines / 2)) * (i + 1);
            } else {
                currentW = (triW / (numLines / 2)) * (numLines - i);
            }

            let xOffset;
            if (isLeft) {
                // ชี้ซ้าย: ยึดเส้นฐานไว้ทางขวา แล้วยืดปลายไปทางซ้าย
                xOffset = triW - currentW;
            } else {
                // ชี้ขวา: ยึดเส้นฐานไว้ทางซ้าย แล้วยืดปลายไปทางขวา
                xOffset = 0;
            }

            // วาดแถบดำทีละชั้น
            zpl += `^FO${startX + xOffset},${startY + (i * lineH)}^GB${Math.ceil(currentW)},${Math.ceil(lineH + 1)},${Math.ceil(lineH + 1)}^FS\n`;
        }
    }

    zpl += `^XZ\n`;
    return zpl;
}