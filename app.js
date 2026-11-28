// =========================================================================
// المنصة التعليمية الافتراضية - الصف العاشر (app.js - الإصدار 11)
// =========================================================================

const MAX_DEVICE_SWITCHES = 3;
const WEEK_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
const BREAK_1_TIME = "09:30 - 09:45";
const BREAK_2_TIME = "11:15 - 11:30";
const DEFAULT_CLOUD_URL = "https://script.google.com/macros/s/AKfycbzoOp5PCZdUxl8shKoJm5oGak7bhc8wwmPr1gGItWw_UaBfZfVKNUCgtMlTX0OWJX1EYA/exec";
const CUSTOM_LOGO_URL = "";

let deferredPwaPrompt = null;
let isCloudDataLoadedSafely = false;
let isSyncingNow = false;
let isScheduleEditorDirty = false;
let localWriteEpoch = 0;
let lastCloudWriteAt = 0;

// =========================================================================
// 1. أدوات التاريخ، العطلة الرسمية (الجمعة والسبت)، وتنسيق النصوص
// =========================================================================
function formatLocalDateISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getTodayISO(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return formatLocalDateISO(d);
}

function isWeekendISO(isoDate) {
    if (!isoDate) return false;
    const parts = isoDate.split('-');
    if (parts.length !== 3) return false;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const day = d.getDay();
    return day === 5 || day === 6; // الجمعة أو السبت
}

function getLastSchoolDayISO() {
    const d = new Date();
    const day = d.getDay();
    if (day === 5) d.setDate(d.getDate() - 1);
    else if (day === 6) d.setDate(d.getDate() - 2);
    return formatLocalDateISO(d);
}

function getArabicDayNameFromISO(isoDate) {
    if (!isoDate) return "";
    const names = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const parts = isoDate.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return names[d.getDay()] || "";
}

function normalizeSecretText(str) {
    if (!str) return "";
    return String(str)
        .trim()
        .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
        .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
        .toUpperCase();
}

function normalizeArabicName(str) {
    if (!str) return "";
    return String(str).trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
}

function isAlaaSpecialTeacher(name) {
    const norm = normalizeArabicName(name);
    return norm.includes('الاء') && (norm.includes('موال') || norm.includes('سلمان'));
}

function escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// =========================================================================
// 2. أيقونات التطبيق وتثبيت PWA على الشاشة الرئيسية
// =========================================================================
function generateRealPngIcon(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(0.5, '#312e81');
    grad.addColorStop(1, '#4338ca');
    ctx.fillStyle = grad;

    const r = size * 0.22;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
    ctx.lineWidth = size * 0.03;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(size * 0.44)}px sans-serif`;
    ctx.fillText('🎓', size / 2, size * 0.40);

    ctx.fillStyle = '#fbbf24';
    ctx.font = `bold ${Math.floor(size * 0.16)}px Cairo, sans-serif`;
    ctx.fillText('منصة العاشر', size / 2, size * 0.77);

    return canvas.toDataURL('image/png');
}

function setupAppIconsAndPWA() {
    const icon192 = CUSTOM_LOGO_URL || generateRealPngIcon(192);
    const icon512 = CUSTOM_LOGO_URL || generateRealPngIcon(512);

    const fav = document.getElementById('app-favicon');
    const apple = document.getElementById('apple-touch-icon');
    const hdr = document.getElementById('header-app-logo');
    const bnr = document.getElementById('banner-app-icon');
    const mdl = document.getElementById('modal-app-icon');
    if (fav) fav.href = icon192;
    if (apple) apple.href = icon192;
    if (hdr) hdr.src = icon192;
    if (bnr) bnr.src = icon192;
    if (mdl) mdl.src = icon192;

    const startUrl = window.location.href.split('#')[0];
    const manifest = {
        name: "المنصة التعليمية الافتراضية - الصف العاشر",
        short_name: "منصة العاشر",
        description: "المنصة التعليمية الافتراضية لطلاب الصف العاشر - المنهاج السوري",
        start_url: startUrl,
        scope: startUrl.substring(0, startUrl.lastIndexOf('/') + 1),
        display: "standalone",
        orientation: "portrait",
        background_color: "#1e1b4b",
        theme_color: "#1e1b4b",
        icons: [
            { src: icon192, sizes: "192x192", type: "image/png", purpose: "any maskable" },
            { src: icon512, sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
    };
    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const pwaEl = document.getElementById('pwa-manifest');
    if (pwaEl) pwaEl.setAttribute('href', URL.createObjectURL(manifestBlob));
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    if (!localStorage.getItem('g10_pwa_dismissed')) {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.classList.remove('hidden');
    }
});

async function triggerPwaInstall() {
    if (deferredPwaPrompt) {
        deferredPwaPrompt.prompt();
        const { outcome } = await deferredPwaPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('pwa-install-banner').classList.add('hidden');
        }
        deferredPwaPrompt = null;
    } else {
        document.getElementById('pwa-guide-modal').classList.remove('hidden');
        document.getElementById('pwa-guide-modal').classList.add('flex');
    }
}

function dismissPwaBanner() {
    localStorage.setItem('g10_pwa_dismissed', '1');
    document.getElementById('pwa-install-banner').classList.add('hidden');
}

function closePwaGuideModal() {
    document.getElementById('pwa-guide-modal').classList.add('hidden');
    document.getElementById('pwa-guide-modal').classList.remove('flex');
}

// =========================================================================
// 3. البصمة المحصّنة (localStorage + Cookie) ومعرّف الجلسة النشطة
// =========================================================================
function setCookie(name, value, days) {
    try {
        const d = new Date();
        d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
    } catch (e) {}
}

function getCookie(name) {
    try {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : "";
    } catch (e) { return ""; }
}

function getOrCreateDeviceId() {
    const lsId = localStorage.getItem('g10_unique_device_id');
    const ckId = getCookie('g10_unique_device_id');
    let devId = lsId || ckId;
    if (!devId) {
        devId = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
    }
    localStorage.setItem('g10_unique_device_id', devId);
    setCookie('g10_unique_device_id', devId, 365);
    return devId;
}
const THIS_DEVICE_ID = getOrCreateDeviceId();

function getSavedSessionId() {
    const s = localStorage.getItem('g10_active_session_id') || getCookie('g10_active_session_id') || "";
    if (s) {
        localStorage.setItem('g10_active_session_id', s);
        setCookie('g10_active_session_id', s, 365);
    }
    return s;
}

function saveSessionId(id) {
    MY_SESSION_ID = id || "";
    if (id) {
        localStorage.setItem('g10_active_session_id', id);
        setCookie('g10_active_session_id', id, 365);
    } else {
        localStorage.removeItem('g10_active_session_id');
        setCookie('g10_active_session_id', '', -1);
    }
}
let MY_SESSION_ID = getSavedSessionId();

// =========================================================================
// 4. الحالة العامة والبيانات الافتراضية والبرنامج الأسبوعي
// =========================================================================
const defaultPeriodTimes = [
    "08:00 - 08:45",
    "08:45 - 09:30",
    "09:45 - 10:30",
    "10:30 - 11:15",
    "11:30 - 12:15",
    "12:15 - 01:00"
];

function createEmptyDaySlots() {
    return Array.from({ length: 6 }, () => ({ subject: "فراغ", teacher: "", branch: "علمي وأدبي" }));
}

function normalizeWeeklySchedule(ws) {
    const base = {
        periodTimes: [...defaultPeriodTimes],
        days: {
            "0": createEmptyDaySlots(),
            "1": createEmptyDaySlots(),
            "2": createEmptyDaySlots(),
            "3": createEmptyDaySlots(),
            "4": createEmptyDaySlots()
        }
    };
    if (!ws || typeof ws !== 'object') return base;
    if (Array.isArray(ws.periodTimes) && ws.periodTimes.length === 6) {
        base.periodTimes = ws.periodTimes.map((t, idx) => (t && String(t).trim()) ? String(t).trim() : defaultPeriodTimes[idx]);
    }
    if (ws.days && typeof ws.days === 'object') {
        ["0", "1", "2", "3", "4"].forEach(dk => {
            if (Array.isArray(ws.days[dk])) {
                base.days[dk] = Array.from({ length: 6 }, (_, p) => {
                    const s = ws.days[dk][p];
                    return (s && typeof s === 'object')
                        ? { subject: s.subject || "فراغ", teacher: s.teacher || "", branch: s.branch || "علمي وأدبي" }
                        : { subject: "فراغ", teacher: "", branch: "علمي وأدبي" };
                });
            }
        });
    }
    return base;
}

const subjectColorPalettes = [
    "bg-blue-50 border-blue-200 text-blue-900",
    "bg-purple-50 border-purple-200 text-purple-900",
    "bg-emerald-50 border-emerald-200 text-emerald-900",
    "bg-teal-50 border-teal-200 text-teal-900",
    "bg-amber-50 border-amber-200 text-amber-900",
    "bg-indigo-50 border-indigo-200 text-indigo-900",
    "bg-pink-50 border-pink-200 text-pink-900",
    "bg-cyan-50 border-cyan-200 text-cyan-900",
    "bg-orange-50 border-orange-200 text-orange-900",
    "bg-lime-50 border-lime-200 text-lime-900"
];

const defaultSyrianSubjects = [
    { name: "الرياضيات", icon: "📐", color: "bg-blue-50 border-blue-200 text-blue-900", driveUrl: "" },
    { name: "الفيزياء", icon: "⚡", color: "bg-purple-50 border-purple-200 text-purple-900", driveUrl: "" },
    { name: "الكيمياء", icon: "🧪", color: "bg-emerald-50 border-emerald-200 text-emerald-900", driveUrl: "" },
    { name: "علم الأحياء", icon: "🧬", color: "bg-teal-50 border-teal-200 text-teal-900", driveUrl: "" },
    { name: "اللغة العربية", icon: "📖", color: "bg-amber-50 border-amber-200 text-amber-900", driveUrl: "" },
    { name: "التربية الدينية", icon: "🕌", color: "bg-emerald-50 border-emerald-200 text-emerald-900", driveUrl: "" },
    { name: "اللغة الإنكليزية", icon: "🌐", color: "bg-indigo-50 border-indigo-200 text-indigo-900", driveUrl: "" },
    { name: "اللغة الفرنسية", icon: "🗼", color: "bg-pink-50 border-pink-200 text-pink-900", driveUrl: "" },
    { name: "المعلوماتية", icon: "💻", color: "bg-cyan-50 border-cyan-200 text-cyan-900", driveUrl: "" },
    { name: "التاريخ", icon: "🏛️", color: "bg-orange-50 border-orange-200 text-orange-900", driveUrl: "" },
    { name: "الجغرافيا", icon: "🌍", color: "bg-lime-50 border-lime-200 text-lime-900", driveUrl: "" },
    { name: "الفلسفة", icon: "💡", color: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-900", driveUrl: "" },
    { name: "التربية الوطنية", icon: "🇸🇾", color: "bg-red-50 border-red-200 text-red-900", driveUrl: "" }
];

const defaultBroadcastHosts = [
    { code: "H1", name: "لابتوب البث الرئيسي - قاعة 1", pin: "1010", deviceId: "", lastSeen: "-" },
    { code: "H2", name: "لابتوب البث الثاني - قاعة 2", pin: "2020", deviceId: "", lastSeen: "-" },
    { code: "H3", name: "لابتوب البث الثالث - قاعة 3", pin: "3030", deviceId: "", lastSeen: "-" }
];

let syrianG10Subjects = JSON.parse(localStorage.getItem('g10_subjects_v10')) || defaultSyrianSubjects;
let broadcastHosts = JSON.parse(localStorage.getItem('g10_hosts_v10')) || defaultBroadcastHosts;

let currentSubjectFilter = "الكل";
let filterOnlyMyClasses = false;
let loginMode = "teacher";
let isStaffLoggingIn = false;

const jsDayNow = new Date().getDay();
let selectedScheduleDay = (jsDayNow >= 0 && jsDayNow <= 4) ? jsDayNow : 0;

let savedStaffSession = JSON.parse(sessionStorage.getItem('g10_staff_session')) || null;
let currentRole = savedStaffSession ? savedStaffSession.role : "student";
let currentTeacherName = savedStaffSession ? savedStaffSession.name : "";
let currentHostCode = savedStaffSession ? (savedStaffSession.hostCode || "") : "";

let currentStudentProfile = JSON.parse(localStorage.getItem('g10_student_profile')) || null;
let adminPin = localStorage.getItem('g10_admin_pin') || "9999";
let adminDeviceId = localStorage.getItem('g10_admin_device_id') || "";

let dailyMeetLinks = JSON.parse(localStorage.getItem('g10_daily_meet_v9')) || {
    sci: "https://meet.google.com/new",
    lit: "",
    generalDrive: "",
    homeworkDrive: "",
    weeklySchedule: normalizeWeeklySchedule(null)
};

let weeklySchedule = normalizeWeeklySchedule(dailyMeetLinks.weeklySchedule || JSON.parse(localStorage.getItem('g10_weekly_schedule_v10') || 'null'));
dailyMeetLinks.weeklySchedule = weeklySchedule;

let teachers = JSON.parse(localStorage.getItem('g10_teachers_v9')) || [
    { name: "أ. مناف جمول", subject: "الرياضيات", pin: "1111", deviceId: "" },
    { name: "أ. سامر الحسن", subject: "الفيزياء", pin: "2222", deviceId: "" },
    { name: "أ. ريم القاسم", subject: "الكيمياء", pin: "3333", deviceId: "" },
    { name: "الآنسة آلاء سلمان موال", subject: "اللغة العربية", pin: "4444", deviceId: "" }
];

let teacherLogs = JSON.parse(localStorage.getItem('g10_logs_v9')) || [
    { teacher: "النظام الأمني", action: "تفعيل الحماية المدمجة والبرنامج الأسبوعي وسجل الحضور اليومي", time: "اليوم" }
];

let lessons = JSON.parse(localStorage.getItem('g10_lessons_v9')) || [];
let students = JSON.parse(localStorage.getItem('g10_students_v9')) || [];
let quizzes = JSON.parse(localStorage.getItem('g10_quizzes_v9')) || [
    {
        subject: "الرياضيات",
        q: "ما هي قيمة المميز $\\Delta$ للمعادلة $x^2 - 5x + 6 = 0$؟",
        options: ["$\\Delta = 1$", "$\\Delta = 25$", "$\\Delta = -1$", "$\\Delta = 49$"],
        correct: 0
    }
];

function ensureReligionSubjectExists() {
    if (!syrianG10Subjects.some(s => s.name === "التربية الدينية")) {
        syrianG10Subjects.push({
            name: "التربية الدينية",
            icon: "🕌",
            color: "bg-emerald-50 border-emerald-200 text-emerald-900",
            driveUrl: ""
        });
    }
}

function ensureStudentFields(s) {
    if (!s.attendance || typeof s.attendance !== 'object') s.attendance = {};
    if (typeof s.deviceSwitchCount !== 'number') s.deviceSwitchCount = 0;
    if (typeof s.isLocked !== 'boolean') s.isLocked = false;
    if (typeof s.activeSessionId !== 'string') s.activeSessionId = "";
    return s;
}

function pruneStudentAttendance(studentObj) {
    if (!studentObj.attendance || typeof studentObj.attendance !== 'object') return;
    const validDates = Object.keys(studentObj.attendance).filter(d => !isWeekendISO(d)).sort();
    if (validDates.length > 60) {
        validDates.slice(0, validDates.length - 60).forEach(d => delete studentObj.attendance[d]);
    }
}

function markStudentPresentToday(studentIdx, defaultNote) {
    const today = getTodayISO(0);
    const nowTime = new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' });
    const st = ensureStudentFields(students[studentIdx]);

    if (isWeekendISO(today)) {
        st.time = nowTime;
        return;
    }

    const existing = st.attendance[today];
    st.attendance[today] = {
        present: true,
        time: (existing && existing.time && existing.time !== "-") ? existing.time : nowTime,
        note: (existing && existing.note) ? existing.note : defaultNote
    };
    st.present = true;
    st.time = st.attendance[today].time;
    st.note = st.attendance[today].note;
    pruneStudentAttendance(st);
}

// =========================================================================
// 5. مسودة تحضير الدرس وقفل المادة للأساتذة
// =========================================================================
function getDraftStorageKey() {
    const ownerKey = currentRole === 'teacher'
        ? `teacher_${normalizeArabicName(currentTeacherName)}`
        : (currentRole === 'admin' ? 'admin_global' : 'guest');
    return `g10_lesson_draft_v1_${ownerKey}`;
}

function saveLessonDraft() {
    if (currentRole !== 'teacher' && currentRole !== 'admin') return;
    const draft = {
        subject: document.getElementById('prep-subject').value,
        branch: document.getElementById('prep-branch').value,
        date: document.getElementById('prep-date').value,
        title: document.getElementById('prep-title').value,
        notes: document.getElementById('prep-notes').value,
        pdf: document.getElementById('prep-pdf').value,
        video: document.getElementById('prep-video').value,
        updatedAt: new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' })
    };
    localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
    updateDraftBadgeUI(draft);
}

function restoreLessonDraftIfAny() {
    const badge = document.getElementById('prep-draft-badge');
    const clearBtn = document.getElementById('clear-draft-btn');
    if (currentRole !== 'teacher' && currentRole !== 'admin') {
        badge.classList.add('hidden');
        clearBtn.classList.add('hidden');
        return;
    }
    const raw = localStorage.getItem(getDraftStorageKey());
    if (!raw) {
        badge.classList.add('hidden');
        clearBtn.classList.add('hidden');
        return;
    }
    try {
        const draft = JSON.parse(raw);
        const hasContent = (draft.title && draft.title.trim() !== "") ||
                           (draft.notes && draft.notes.trim() !== "") ||
                           (draft.pdf && draft.pdf.trim() !== "") ||
                           (draft.video && draft.video.trim() !== "");
        if (!hasContent) {
            badge.classList.add('hidden');
            clearBtn.classList.add('hidden');
            return;
        }
        if (draft.branch) document.getElementById('prep-branch').value = draft.branch;
        if (draft.date) document.getElementById('prep-date').value = draft.date;
        if (draft.title) document.getElementById('prep-title').value = draft.title;
        if (draft.notes) document.getElementById('prep-notes').value = draft.notes;
        if (draft.pdf) document.getElementById('prep-pdf').value = draft.pdf;
        if (draft.video) document.getElementById('prep-video').value = draft.video;

        const subSelect = document.getElementById('prep-subject');
        if (draft.subject && Array.from(subSelect.options).some(o => o.value === draft.subject)) {
            subSelect.value = draft.subject;
        }
        updateDraftBadgeUI(draft);
    } catch (e) {
        badge.classList.add('hidden');
        clearBtn.classList.add('hidden');
    }
}

function updateDraftBadgeUI(draft) {
    const badge = document.getElementById('prep-draft-badge');
    const clearBtn = document.getElementById('clear-draft-btn');
    const hasContent = draft && ((draft.title && draft.title.trim() !== "") || (draft.notes && draft.notes.trim() !== "") || (draft.pdf && draft.pdf.trim() !== "") || (draft.video && draft.video.trim() !== ""));
    if (hasContent) {
        badge.innerText = `💾 مسودة محفوظة (${draft.updatedAt || 'الآن'})`;
        badge.classList.remove('hidden');
        clearBtn.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
        clearBtn.classList.add('hidden');
    }
}

function clearLessonDraft(askConfirm = false) {
    if (askConfirm && !confirm("هل تريد مسح المسودة المحفوظة حالياً؟")) return;
    localStorage.removeItem(getDraftStorageKey());
    document.getElementById('prep-title').value = '';
    document.getElementById('prep-notes').value = '';
    document.getElementById('prep-pdf').value = '';
    document.getElementById('prep-video').value = '';
    document.getElementById('prep-date').value = getTodayISO(0);
    enforceTeacherSubjectLock();
    updateDraftBadgeUI(null);
}

function enforceTeacherSubjectLock() {
    const prepSubSelect = document.getElementById('prep-subject');
    const lockText = document.getElementById('prep-lock-status-text');
    if (!prepSubSelect) return;

    if (currentRole === 'teacher') {
        const normCurrent = normalizeArabicName(currentTeacherName);
        const tObj = teachers.find(t => normalizeArabicName(t.name) === normCurrent)
            || teachers.find(t => normCurrent && normalizeArabicName(t.name).includes(normCurrent));
        const isAlaa = isAlaaSpecialTeacher(currentTeacherName);

        if (isAlaa) {
            ensureReligionSubjectExists();
            const allowedSubs = ["اللغة العربية", "التربية الدينية"];
            const prevVal = prepSubSelect.value;
            prepSubSelect.innerHTML = allowedSubs.map(sName => `<option value="${sName}">${sName}</option>`).join('');
            prepSubSelect.value = allowedSubs.includes(prevVal) ? prevVal : (tObj && allowedSubs.includes(tObj.subject) ? tObj.subject : "اللغة العربية");
            prepSubSelect.disabled = false;
            prepSubSelect.className = "w-full border-2 border-amber-400 rounded-lg p-2.5 bg-amber-50 font-extrabold text-indigo-950";
            if (lockText) {
                lockText.innerHTML = `✨ حالة خاصة للآنسة آلاء سلمان موال: متاح لك <span class="text-amber-800 underline">اللغة العربية</span> و<span class="text-emerald-800 underline">التربية الدينية</span> فقط مع تأكيد النشر.`;
            }
        } else {
            const assignedSubject = (tObj && tObj.subject) ? tObj.subject : "الرياضيات";
            prepSubSelect.innerHTML = `<option value="${escapeAttr(assignedSubject)}">${assignedSubject}</option>`;
            prepSubSelect.value = assignedSubject;
            prepSubSelect.disabled = true;
            prepSubSelect.className = "w-full border-2 border-indigo-300 rounded-lg p-2.5 bg-indigo-50/80 font-extrabold text-indigo-950 cursor-not-allowed pointer-events-none";
            if (lockText) {
                lockText.innerHTML = `🔒 المادة مقفلة تلقائياً على تخصصك: <span class="bg-indigo-900 text-white px-2.5 py-0.5 rounded-md">${assignedSubject}</span> لمنع الخطأ أو النسيان.`;
            }
        }
    } else if (currentRole === 'admin') {
        const prevVal = prepSubSelect.value;
        prepSubSelect.innerHTML = syrianG10Subjects.map(sub => `<option value="${escapeAttr(sub.name)}">${sub.name}</option>`).join('');
        if (prevVal && Array.from(prepSubSelect.options).some(o => o.value === prevVal)) {
            prepSubSelect.value = prevVal;
        }
        prepSubSelect.disabled = false;
        prepSubSelect.className = "w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 font-bold";
        if (lockText) {
            lockText.innerHTML = `👑 صلاحية المدير العام: يمكنك اختيار أي مادة من المنهاج وسيطلب تأكيد النشر قبل الحفظ.`;
        }
    } else {
        prepSubSelect.disabled = false;
        prepSubSelect.className = "w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50";
    }
}

// =========================================================================
// 6. تهيئة الصفحة وتحديث واجهة الأدوار
// =========================================================================
function getActiveCloudUrl() {
    const saved = localStorage.getItem('g10_admin_cloud_url');
    return (saved && saved.trim() !== "") ? saved.trim() : DEFAULT_CLOUD_URL;
}

function applyRoleUI() {
    if (currentRole === 'teacher') {
        document.body.className = "bg-slate-100 text-slate-800 min-h-screen flex flex-col role-teacher";
        document.getElementById('role-badge').innerText = `وضع الأستاذ: ${currentTeacherName} 👨‍🏫`;
        document.getElementById('role-badge').className = "bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs px-2.5 py-0.5 rounded-full font-bold";
        document.getElementById('prep-teacher-label').innerText = `الأستاذ المحضّر: ${currentTeacherName}`;
    } else if (currentRole === 'broadcaster') {
        document.body.className = "bg-slate-100 text-slate-800 min-h-screen flex flex-col role-broadcaster";
        document.getElementById('role-badge').innerText = `💻 ${currentTeacherName} (${currentHostCode})`;
        document.getElementById('role-badge').className = "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 text-xs px-2.5 py-0.5 rounded-full font-bold";
    } else if (currentRole === 'admin') {
        document.body.className = "bg-slate-100 text-slate-800 min-h-screen flex flex-col role-admin";
        document.getElementById('role-badge').innerText = "وضع المدير العام 👑";
        document.getElementById('role-badge').className = "bg-rose-500/20 text-rose-300 border border-rose-400/30 text-xs px-2.5 py-0.5 rounded-full font-bold";
        document.getElementById('prep-teacher-label').innerText = "إشراف المدير العام";
    } else {
        document.body.className = "bg-slate-100 text-slate-800 min-h-screen flex flex-col";
        document.getElementById('role-badge').innerText = "وضع الطالب 👨‍🎓";
        document.getElementById('role-badge').className = "bg-sky-500/20 text-sky-300 border border-sky-400/30 text-xs px-2.5 py-0.5 rounded-full font-bold";
    }

    enforceTeacherSubjectLock();
    restoreLessonDraftIfAny();
    updateHeaderButtons();
    updateStudentBarUI();
}

function detectInAppBrowserTip() {
    const ua = navigator.userAgent || "";
    const isInApp = /WhatsApp|FBAN|FBAV|Instagram|Telegram|wv\)/i.test(ua);
    const warnEl = document.getElementById('inapp-browser-warning');
    if (warnEl) warnEl.classList.toggle('hidden', !isInApp);
}

document.addEventListener('DOMContentLoaded', function() {
    setupAppIconsAndPWA();
    document.getElementById('prep-date').value = getTodayISO(0);
    document.getElementById('att-date-picker').value = getLastSchoolDayISO();
    document.getElementById('cloud-url').value = getActiveCloudUrl();
    detectInAppBrowserTip();
    updateDailyMeetInputsUI();
    renderSubjects();
    applyRoleUI();
    renderWeeklySchedule();
    renderLessons();
    renderStudents();
    renderQuizzes();
    renderAdminScheduleEditor();
    renderAdminDashboard();

    if (!localStorage.getItem('g10_pwa_dismissed')) {
        document.getElementById('pwa-install-banner').classList.remove('hidden');
    }

    if (currentRole === 'student' && !currentStudentProfile) {
        openStudentRegModal(false, false);
    }

    fetchFromCloud(false, true, false, true);

    setInterval(() => {
        if (!isStaffLoggingIn && !isSyncingNow && (Date.now() - lastCloudWriteAt > 12000)) {
            fetchFromCloud(false, true, false, false);
        }
    }, 20000);
});

// =========================================================================
// 7. القاعة المباشرة وروابط Google Drive
// =========================================================================
function updateDailyMeetInputsUI() {
    document.getElementById('daily-meet-sci').value = dailyMeetLinks.sci || "";
    document.getElementById('daily-meet-lit').value = dailyMeetLinks.lit || "";
    document.getElementById('general-drive-input').value = dailyMeetLinks.generalDrive || "";
    document.getElementById('homework-drive-input').value = dailyMeetLinks.homeworkDrive || "";

    const hwBtn = document.getElementById('homework-drive-btn');
    if (dailyMeetLinks.homeworkDrive && dailyMeetLinks.homeworkDrive.trim() !== "") {
        hwBtn.classList.remove('hidden');
        hwBtn.classList.add('flex');
    } else {
        hwBtn.classList.add('hidden');
        hwBtn.classList.remove('flex');
    }
}

function openGeneralDriveFolder() {
    const url = dailyMeetLinks.generalDrive;
    if (!url || url.trim() === "") {
        if (currentRole === 'admin' || currentRole === 'teacher') {
            const inputUrl = prompt("📂 الصق رابط مجلد Google Drive العام للمنهاج والوظائف ليتم تفعيله لجميع الطلاب:");
            if (inputUrl && inputUrl.trim() !== "") {
                dailyMeetLinks.generalDrive = inputUrl.trim();
                updateDailyMeetInputsUI();
                saveAllLocal();
                syncToCloud(false);
                window.open(dailyMeetLinks.generalDrive, '_blank');
            }
        } else {
            alert("📂 سيقوم الأستاذ أو الإدارة برفع رابط مجلد الـ Drive العام قريباً!");
        }
        return;
    }
    window.open(url.trim(), '_blank');
}

function openHomeworkDriveFolder() {
    if (dailyMeetLinks.homeworkDrive && dailyMeetLinks.homeworkDrive.trim() !== "") {
        window.open(dailyMeetLinks.homeworkDrive.trim(), '_blank');
    }
}

async function saveGeneralDriveLinks() {
    if (currentRole !== 'admin' && currentRole !== 'teacher') return;
    localWriteEpoch++;
    dailyMeetLinks.generalDrive = document.getElementById('general-drive-input').value.trim();
    dailyMeetLinks.homeworkDrive = document.getElementById('homework-drive-input').value.trim();
    dailyMeetLinks.weeklySchedule = weeklySchedule;

    teacherLogs.unshift({
        teacher: currentTeacherName || "الإدارة",
        action: "📂 تحديث رابط مجلد الـ Drive العام للمواد والوظائف",
        time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' })
    });
    if (teacherLogs.length > 50) teacherLogs.pop();

    updateDailyMeetInputsUI();
    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
    alert("✅ تم حفظ وتعميم روابط مجلد الـ Drive العام للمواد والوظائف لجميع الطلاب!");
}

async function saveDailyMeetLinks() {
    if (currentRole !== 'admin' && currentRole !== 'teacher' && currentRole !== 'broadcaster') return;
    const sciUrl = document.getElementById('daily-meet-sci').value.trim();
    const litUrl = document.getElementById('daily-meet-lit').value.trim();
    if (!sciUrl) return alert("يرجى وضع رابط Google Meet الأساسي لليوم الدراسي!");

    localWriteEpoch++;
    dailyMeetLinks.sci = sciUrl;
    dailyMeetLinks.lit = litUrl;
    dailyMeetLinks.weeklySchedule = weeklySchedule;

    teacherLogs.unshift({
        teacher: currentTeacherName || "لابتوب البث",
        action: "📹 تحديث رابط القاعة المباشرة الموحدة لليوم الدراسي",
        time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' })
    });
    if (teacherLogs.length > 50) teacherLogs.pop();

    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
    alert("✅ تم تثبيت رابط القاعة المباشرة لليوم الدراسي!");
}

async function joinDailyLiveRoom(branchType) {
    verifyActiveUserDeviceSession();
    if (!currentStudentProfile && currentRole === 'student') return;

    let targetUrl = dailyMeetLinks.sci;
    if (branchType === 'أدبي' && dailyMeetLinks.lit && dailyMeetLinks.lit.trim() !== "") {
        targetUrl = dailyMeetLinks.lit.trim();
    }
    if (!targetUrl || targetUrl.trim() === "") {
        return alert("لم يتم تفعيل رابط القاعة المباشرة لهذا اليوم بعد!");
    }

    if (currentRole === 'student' && currentStudentProfile) {
        const idx = students.findIndex(s => normalizeSecretText(s.code) === normalizeSecretText(currentStudentProfile.code));
        if (idx > -1) {
            const st = ensureStudentFields(students[idx]);
            if (st.isLocked || (st.activeSessionId && st.activeSessionId !== MY_SESSION_ID)) {
                verifyActiveUserDeviceSession();
                return;
            }
            localWriteEpoch++;
            markStudentPresentToday(idx, `متواجد في قاعة الدوام (${branchType})`);
            saveAllLocal();
            renderStudents();
            renderAdminDashboard();
            syncToCloud(false);
        } else {
            verifyActiveUserDeviceSession();
            return;
        }
    }

    window.open(targetUrl, '_blank');
}

function shareDailyRoomWhatsApp() {
    const sciLink = dailyMeetLinks.sci || "https://meet.google.com/new";
    const today = getTodayISO(0);
    let text = `🎓 *رابط الدوام المدرسي الافتراضي الموحد لليوم (${today})*\n` +
               `📌 يبقى هذا الرابط مفعلاً طوال اليوم الدراسي ويتبدل الأساتذة داخل القاعة حسب برنامج الحصص:\n\n` +
               `🔬 *رابط قاعة Google Meet:*\n${sciLink}`;
    if (dailyMeetLinks.lit && dailyMeetLinks.lit.trim() !== "") {
        text += `\n\n📖 *رابط قاعة الأدبي:*\n${dailyMeetLinks.lit.trim()}`;
    }
    if (dailyMeetLinks.generalDrive && dailyMeetLinks.generalDrive.trim() !== "") {
        text += `\n\n📂 *مجلد المواد والوظائف (Drive):*\n${dailyMeetLinks.generalDrive.trim()}`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

// =========================================================================
// 8. دخول الطلاب ولابتوبات البث (H) + التحقق من الحماية المدمجة
// =========================================================================
function updateStudentPreviewByCode(cleanCode) {
    const namePreview = document.getElementById('reg-official-name-preview');
    const branchPreview = document.getElementById('reg-official-branch-preview');
    if (!namePreview || !branchPreview) return;

    if (!cleanCode) {
        namePreview.innerText = "يُعرض تلقائياً عند مطابقة الرمز";
        branchPreview.innerText = "-";
        return;
    }

    const matched = students.find(s => normalizeSecretText(s.code) === cleanCode);
    if (matched) {
        namePreview.innerText = matched.name;
        branchPreview.innerText = matched.branch || "علمي";
    } else if (/^A\d+$/.test(cleanCode)) {
        namePreview.innerText = "غير موجود في القائمة المعتمدة";
        branchPreview.innerText = "-";
    } else {
        namePreview.innerText = "بانتظار إدخال رمز صحيح (مثل A101)";
        branchPreview.innerText = "-";
    }
}

function checkSecretHostCode(val) {
    const clean = normalizeSecretText(val);
    const pinWrapper = document.getElementById('secret-host-pin-wrapper');
    const pinInput = document.getElementById('reg-secret-host-pin');
    const officialWrapper = document.getElementById('reg-official-info-wrapper');

    if (clean.startsWith('H')) {
        pinWrapper.classList.remove('hidden');
        pinInput.required = true;
        if (officialWrapper) officialWrapper.classList.add('hidden');
    } else {
        pinWrapper.classList.add('hidden');
        pinInput.required = false;
        pinInput.value = '';
        if (officialWrapper) officialWrapper.classList.remove('hidden');
        updateStudentPreviewByCode(clean);
    }
}

function clearLocalStudentSession(warningMsg) {
    localStorage.removeItem('g10_student_profile');
    saveSessionId("");
    currentStudentProfile = null;
    updateHeaderButtons();
    updateStudentBarUI();
    openStudentRegModal(false, true, warningMsg);
}

function verifyActiveUserDeviceSession() {
    if (isStaffLoggingIn) return;

    if (currentRole === 'student') {
        if (!currentStudentProfile) {
            updateHeaderButtons();
            openStudentRegModal(false, false);
            return;
        }
        const cloudStudent = students.find(s => normalizeSecretText(s.code) === normalizeSecretText(currentStudentProfile.code));
        if (!cloudStudent) {
            clearLocalStudentSession("🔄 رمزك غير موجود في القائمة المعتمدة حالياً، يرجى مراجعة الإدارة!");
            return;
        }
        ensureStudentFields(cloudStudent);

        if (cloudStudent.isLocked) {
            clearLocalStudentSession(`⛔ تم إيقاف هذا الحساب مؤقتاً لتجاوز الحد المسموح لتبديل الأجهزة (${MAX_DEVICE_SWITCHES} تبديلات). يرجى مراجعة الإدارة لفك القفل.`);
            return;
        }

        if (!cloudStudent.deviceId || cloudStudent.deviceId === "") {
            clearLocalStudentSession("🔄 تم فك ارتباط هذا الجهاز من قِبل الإدارة، يرجى إعادة تسجيل الدخول برمزك.");
            return;
        }

        if (cloudStudent.activeSessionId) {
            if (!MY_SESSION_ID && cloudStudent.deviceId === THIS_DEVICE_ID) {
                saveSessionId(cloudStudent.activeSessionId);
            } else if (cloudStudent.activeSessionId !== MY_SESSION_ID) {
                clearLocalStudentSession("🔄 تم فتح حسابك من جهاز أو متصفح آخر، فتم إنهاء هذه الجلسة تلقائياً (نظام الجلسة الواحدة النشطة).");
                return;
            }
        } else if (cloudStudent.deviceId !== THIS_DEVICE_ID) {
            clearLocalStudentSession("🔄 يرجى إعادة تسجيل الدخول برمزك لتفعيل الجلسة على هذا الجهاز.");
            return;
        }

        currentStudentProfile = {
            name: cloudStudent.name,
            code: normalizeSecretText(cloudStudent.code),
            branch: cloudStudent.branch || "علمي",
            deviceId: cloudStudent.deviceId
        };
        localStorage.setItem('g10_student_profile', JSON.stringify(currentStudentProfile));
        updateHeaderButtons();
        updateStudentBarUI();
    } else if (currentRole === 'teacher') {
        const tObj = teachers.find(t => t.name === currentTeacherName);
        if (!tObj || (tObj.deviceId && tObj.deviceId !== "" && tObj.deviceId !== THIS_DEVICE_ID)) {
            alert("🔄 تم فك ارتباط جهاز الأستاذ أو تعديل صلاحيته من قِبل المدير العام، يرجى إعادة تسجيل الدخول!");
            logoutUser();
        }
    } else if (currentRole === 'broadcaster') {
        const hObj = broadcastHosts.find(h => normalizeSecretText(h.code) === normalizeSecretText(currentHostCode));
        if (!hObj || (hObj.deviceId && hObj.deviceId !== "" && hObj.deviceId !== THIS_DEVICE_ID)) {
            alert("🔄 تم فك ارتباط لابتوب البث من قِبل المدير العام، يرجى إعادة تسجيل الدخول!");
            logoutUser();
        }
    } else if (currentRole === 'admin') {
        if (adminDeviceId && adminDeviceId !== "" && adminDeviceId !== THIS_DEVICE_ID) {
            alert("⛔ حساب المدير مرتبط بجهاز آخر!");
            logoutUser();
        }
    }
}

function openStudentRegModal(allowClose = false, showSecurityWarning = false, customMsg = "") {
    if (isStaffLoggingIn || currentRole !== 'student') return;
    const modal = document.getElementById('student-reg-modal');
    const closeBtn = document.getElementById('close-reg-btn');
    const secAlert = document.getElementById('reg-security-alert');

    if (allowClose && (currentStudentProfile || currentRole !== 'student')) {
        closeBtn.classList.remove('hidden');
    } else {
        closeBtn.classList.add('hidden');
    }

    if (showSecurityWarning) {
        secAlert.innerText = customMsg || "⚠️ يرجى إدخال رمز الطالب المعتمد من الإدارة (A...) للمتابعة.";
        secAlert.classList.remove('hidden');
    } else {
        secAlert.classList.add('hidden');
    }

    const codeInput = document.getElementById('reg-student-code');
    if (currentStudentProfile) codeInput.value = currentStudentProfile.code;
    checkSecretHostCode(codeInput.value);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeStudentRegModal() {
    if (currentRole === 'student' && !currentStudentProfile) {
        alert("⚠️ يرجى إدخال رمز الطالب المعتمد من الإدارة (A...) أولاً!");
        return;
    }
    document.getElementById('student-reg-modal').classList.add('hidden');
    document.getElementById('student-reg-modal').classList.remove('flex');
}

function switchFromRegToStaff(mode) {
    isStaffLoggingIn = true;
    document.getElementById('student-reg-modal').classList.add('hidden');
    document.getElementById('student-reg-modal').classList.remove('flex');
    openLoginModal(mode);
}

async function saveStudentFirstTime(event) {
    event.preventDefault();
    const btn = document.getElementById('reg-submit-btn');
    const secAlert = document.getElementById('reg-security-alert');
    secAlert.classList.add('hidden');
    const code = normalizeSecretText(document.getElementById('reg-student-code').value);

    // 1) لابتوبات البث المخفية (H)
    if (code.startsWith('H')) {
        if (!/^H\d+$/.test(code)) return alert("⚠️ صيغة الرمز غير صحيحة!");
        const secretPin = normalizeSecretText(document.getElementById('reg-secret-host-pin').value);
        if (!secretPin) return alert("⚠️ يرجى إدخال كلمة المرور الخاصة بهذا الرمز!");

        isStaffLoggingIn = true;
        btn.disabled = true;
        btn.innerText = "⏳ جارٍ التحقق من الرمز وكلمة المرور...";

        await fetchFromCloud(false, true, true, true);

        const hIdx = broadcastHosts.findIndex(h => normalizeSecretText(h.code) === code);
        if (hIdx === -1 || normalizeSecretText(broadcastHosts[hIdx].pin) !== secretPin) {
            isStaffLoggingIn = false;
            btn.disabled = false;
            btn.innerText = "✅ تسجيل الدخول وتفعيل الجلسة";
            return alert("❌ الرمز أو كلمة المرور غير صحيحة!");
        }

        const hostObj = broadcastHosts[hIdx];
        const nowStr = new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' });

        if (hostObj.deviceId && hostObj.deviceId !== "" && hostObj.deviceId !== THIS_DEVICE_ID) {
            localWriteEpoch++;
            teacherLogs.unshift({
                teacher: `${hostObj.code} (${hostObj.name})`,
                action: "⛔ محاولة دخول مرفوضة لحساب البث من جهاز آخر",
                time: nowStr
            });
            if (teacherLogs.length > 50) teacherLogs.pop();
            saveAllLocal();
            renderAdminDashboard();
            await syncToCloud(false);

            isStaffLoggingIn = false;
            btn.disabled = false;
            btn.innerText = "✅ تسجيل الدخول وتفعيل الجلسة";
            secAlert.innerText = `⛔ هذا الحساب (${hostObj.code}) مرتبط بلابتوب آخر! يجب فك القفل من لوحة المدير أولاً.`;
            secAlert.classList.remove('hidden');
            return;
        }

        localWriteEpoch++;
        broadcastHosts[hIdx].deviceId = THIS_DEVICE_ID;
        broadcastHosts[hIdx].lastSeen = nowStr;

        currentRole = "broadcaster";
        currentTeacherName = hostObj.name;
        currentHostCode = hostObj.code;
        sessionStorage.setItem('g10_staff_session', JSON.stringify({ role: 'broadcaster', name: hostObj.name, hostCode: hostObj.code }));

        teacherLogs.unshift({
            teacher: `💻 ${hostObj.code}`,
            action: `تسجيل دخول لابتوب البث المباشر (${hostObj.name})`,
            time: nowStr
        });
        if (teacherLogs.length > 50) teacherLogs.pop();

        saveAllLocal();
        applyRoleUI();
        renderAdminDashboard();
        renderLessons();
        await syncToCloud(false);

        isStaffLoggingIn = false;
        btn.disabled = false;
        btn.innerText = "✅ تسجيل الدخول وتفعيل الجلسة";
        document.getElementById('reg-secret-host-pin').value = '';
        document.getElementById('student-reg-modal').classList.add('hidden');
        document.getElementById('student-reg-modal').classList.remove('flex');
        return;
    }

    // 2) دخول الطالب بالنظام المدمج
    if (!/^A\d+$/.test(code)) {
        return alert("⚠️ يرجى إدخال رمز طالب صحيح يبدأ بحرف A وبجانبه رقم (مثال: A101)");
    }

    btn.disabled = true;
    btn.innerText = "⏳ جارٍ التحقق من الرمز عبر السحابة...";

    await fetchFromCloud(false, true, true, true);
    updateStudentPreviewByCode(code);

    const existingIdx = students.findIndex(s => normalizeSecretText(s.code) === code);
    if (existingIdx === -1) {
        btn.disabled = false;
        btn.innerText = "✅ تسجيل الدخول وتفعيل الجلسة";
        secAlert.innerText = `⛔ مرفوض! الرمز (${code}) غير موجود ضمن الطلاب المضافين من قِبل المدير.`;
        secAlert.classList.remove('hidden');
        alert(`⛔ الرمز (${code}) غير معتمد من الإدارة.`);
        return;
    }

    const regStudent = ensureStudentFields(students[existingIdx]);
    const nowStr = new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' });

    if (regStudent.isLocked) {
        btn.disabled = false;
        btn.innerText = "✅ تسجيل الدخول وتفعيل الجلسة";
        secAlert.innerText = `⛔ تم إيقاف الرمز (${code}) الخاص بالطالب (${regStudent.name}) لتجاوز الحد المسموح لتبديل الأجهزة (${MAX_DEVICE_SWITCHES} تبديلات). يرجى مراجعة الإدارة لفك القفل.`;
        secAlert.classList.remove('hidden');
        alert(`⛔ الحساب (${code}) مقفل أمنياً! يرجى مراجعة الإدارة.`);
        return;
    }

    let switchNotice = "";
    if (!regStudent.deviceId || regStudent.deviceId === "") {
        regStudent.deviceId = THIS_DEVICE_ID;
        regStudent.deviceSwitchCount = 0;
    } else if (regStudent.deviceId !== THIS_DEVICE_ID) {
        const nextCount = (regStudent.deviceSwitchCount || 0) + 1;
        if (nextCount > MAX_DEVICE_SWITCHES) {
            localWriteEpoch++;
            regStudent.isLocked = true;
            teacherLogs.unshift({
                teacher: `${regStudent.name} (${regStudent.code})`,
                action: `🚨 قفل الحساب تلقائياً! تجاوز حد تبديل الأجهزة (المحاولة ${nextCount})`,
                time: nowStr
            });
            if (teacherLogs.length > 50) teacherLogs.pop();
            saveAllLocal();
            renderStudents();
            renderAdminDashboard();
            await syncToCloud(false);

            btn.disabled = false;
            btn.innerText = "✅ تسجيل الدخول وتفعيل الجلسة";
            secAlert.innerText = `⛔ تم قفل الرمز (${code}) تلقائياً لتجاوز الحد المسموح لتبديل الأجهزة (${MAX_DEVICE_SWITCHES} تبديلات). تم إبلاغ المدير العام.`;
            secAlert.classList.remove('hidden');
            alert(`⛔ تم قفل الرمز (${code}) لتجاوز حد تبديل الأجهزة!`);
            return;
        } else {
            regStudent.deviceSwitchCount = nextCount;
            regStudent.deviceId = THIS_DEVICE_ID;
            switchNotice = `\n⚠️ تنبيه حماية: تم تفعيل الجلسة على هذا الجهاز وإغلاق الجلسة السابقة (تبديل ${nextCount} من ${MAX_DEVICE_SWITCHES}).`;
            teacherLogs.unshift({
                teacher: `${regStudent.name} (${regStudent.code})`,
                action: `⚠️ تبديل جهاز وطرد الجلسة السابقة (${nextCount}/${MAX_DEVICE_SWITCHES})`,
                time: nowStr
            });
            if (teacherLogs.length > 50) teacherLogs.pop();
        }
    }

    const newSessionId = 'SESS-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    localWriteEpoch++;
    regStudent.activeSessionId = newSessionId;
    markStudentPresentToday(existingIdx, "تسجيل دخول للمنصة");

    btn.innerText = "⬆️ جارٍ تثبيت الجلسة في السحابة...";
    const synced = await syncToCloud(false);

    if (!synced) {
        btn.disabled = false;
        btn.innerText = "✅ تسجيل الدخول وتفعيل الجلسة";
        alert("⚠️ الاتصال ضعيف ولم يتم تثبيت دخولك في السحابة بعد. يرجى الضغط على الزر مرة أخرى!");
        return;
    }

    saveSessionId(newSessionId);
    currentStudentProfile = {
        name: regStudent.name,
        code: code,
        branch: regStudent.branch || "علمي",
        deviceId: THIS_DEVICE_ID
    };
    localStorage.setItem('g10_student_profile', JSON.stringify(currentStudentProfile));

    saveAllLocal();
    updateHeaderButtons();
    updateStudentBarUI();
    renderWeeklySchedule();
    renderStudents();
    renderAdminDashboard();

    btn.disabled = false;
    btn.innerText = "✅ تسجيل الدخول وتفعيل الجلسة";
    closeStudentRegModal();
    alert(`✅ أهلاً بك يا (${regStudent.name})! تم تفعيل جلستك بنجاح.${switchNotice}`);
}

function updateStudentBarUI() {
    const bar = document.getElementById('student-info-bar');
    const lockBadge = document.getElementById('device-lock-badge');
    if (currentRole === 'teacher') {
        bar.innerHTML = `الأستاذ الحالي: <b class="text-amber-300">${currentTeacherName}</b>`;
        lockBadge.classList.remove('hidden');
    } else if (currentRole === 'broadcaster') {
        bar.innerHTML = `جهاز البث النشط: <b class="text-cyan-300">${currentTeacherName} (${currentHostCode})</b>`;
        lockBadge.classList.remove('hidden');
    } else if (currentRole === 'admin') {
        bar.innerHTML = `<b class="text-rose-300">إدارة المنصة الشاملة (المدير العام)</b>`;
        lockBadge.classList.remove('hidden');
    } else if (currentStudentProfile) {
        bar.innerHTML = `الطالب: <b class="text-white">${currentStudentProfile.name}</b> | الرمز: <b class="text-amber-300 font-mono">${currentStudentProfile.code}</b> | الفرع: <b class="text-emerald-300">${currentStudentProfile.branch}</b>`;
        lockBadge.classList.remove('hidden');
    } else {
        bar.innerText = "الصف العاشر (علمي / أدبي) - المنهاج السوري";
        lockBadge.classList.add('hidden');
    }
}

// =========================================================================
// 9. المزامنة السحابية (Google Sheets) مع الحماية ضد التضارب
// =========================================================================
function updateSyncBadge(text, classes) {
    const el = document.getElementById('sync-status');
    el.innerText = text;
    el.className = `text-[11px] px-2.5 py-0.5 rounded-full font-bold ${classes}`;
}

async function fetchFromCloud(showAlert = false, silent = false, skipSessionVerify = false, forceFetch = false) {
    if (!forceFetch && (isSyncingNow || (Date.now() - lastCloudWriteAt < 12000))) return;
    const url = getActiveCloudUrl();
    if (!url) return;
    const startEpoch = localWriteEpoch;

    if (!silent) updateSyncBadge("⏳ جارٍ المزامنة مع السحابة...", "bg-sky-500/20 text-sky-300");
    try {
        const res = await fetch(url + "?t=" + new Date().getTime(), { redirect: "follow" });
        const data = await res.json();

        if (!forceFetch && (isSyncingNow || startEpoch !== localWriteEpoch)) return;

        if (data && Array.isArray(data.lessons)) {
            if (Array.isArray(data.students) && (data.students.length > 0 || students.length === 0)) {
                students = data.students.map(ensureStudentFields);
            }
            if (Array.isArray(data.teachers) && data.teachers.length > 0) {
                teachers = data.teachers;
            }
            lessons = data.lessons.length > 0 ? data.lessons : lessons;
            quizzes = (Array.isArray(data.quizzes) && data.quizzes.length > 0) ? data.quizzes : quizzes;
            teacherLogs = data.teacherLogs || teacherLogs;

            if (data.subjects && Array.isArray(data.subjects) && data.subjects.length > 0) {
                syrianG10Subjects = data.subjects;
            }
            if (data.broadcastHosts && Array.isArray(data.broadcastHosts) && data.broadcastHosts.length > 0) {
                broadcastHosts = data.broadcastHosts;
            }
            if (data.dailyMeetLinks) {
                dailyMeetLinks = data.dailyMeetLinks;
                if (data.dailyMeetLinks.weeklySchedule) {
                    weeklySchedule = normalizeWeeklySchedule(data.dailyMeetLinks.weeklySchedule);
                }
                dailyMeetLinks.weeklySchedule = weeklySchedule;
                updateDailyMeetInputsUI();
            }
            if (data.adminPin) {
                adminPin = data.adminPin;
                localStorage.setItem('g10_admin_pin', adminPin);
            }
            if (typeof data.adminDeviceId !== 'undefined') {
                adminDeviceId = data.adminDeviceId;
                localStorage.setItem('g10_admin_device_id', adminDeviceId);
            }

            isCloudDataLoadedSafely = true;

            saveAllLocal();
            renderSubjects();
            renderWeeklySchedule();
            renderLessons();
            renderStudents();
            renderQuizzes();
            if (!isScheduleEditorDirty) renderAdminScheduleEditor();
            renderAdminDashboard();
            updateHeaderButtons();
            updateSyncBadge("🟢 متصل ومؤمّن تلقائياً", "bg-emerald-500/20 text-emerald-300");

            if (!skipSessionVerify && !isStaffLoggingIn) {
                verifyActiveUserDeviceSession();
            }

            if (showAlert) alert("✅ تم جلب أحدث البيانات والبرنامج وسجل الحضور من السحابة بنجاح!");
        } else {
            updateSyncBadge("⚠️ السحابة قيد التهيئة", "bg-amber-500/20 text-amber-300");
        }
    } catch (e) {
        if (!silent) updateSyncBadge("🔴 تعذر الاتصال بالسحابة", "bg-rose-500/20 text-rose-300");
        if (showAlert) alert("تأكد من الاتصال بالإنترنت ومن إعداد صلاحية Google Script على (Anyone).");
    }
}

async function syncToCloud(showAlert = false) {
    const url = getActiveCloudUrl();
    if (!url) return false;

    if (!isCloudDataLoadedSafely && !showAlert) {
        console.warn("تم منع الرفع التلقائي لحماية السحابة لأن البيانات الأصلية لم تُجلب بعد.");
        return false;
    }

    isSyncingNow = true;
    localWriteEpoch++;
    dailyMeetLinks.weeklySchedule = weeklySchedule;
    updateSyncBadge("⬆️ جارٍ الحفظ بالسحابة...", "bg-sky-500/20 text-sky-300");
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                lessons,
                students,
                quizzes,
                teachers,
                teacherLogs,
                adminPin,
                adminDeviceId,
                dailyMeetLinks,
                subjects: syrianG10Subjects,
                broadcastHosts
            })
        });
        if (!res.ok) throw new Error("Cloud POST failed");
        isCloudDataLoadedSafely = true;
        lastCloudWriteAt = Date.now();
        updateSyncBadge("🟢 متصل ومؤمّن تلقائياً", "bg-emerald-500/20 text-emerald-300");
        if (showAlert) alert("✅ تم رفع وحفظ كافة التعديلات في السحابة بنجاح!");
        return true;
    } catch (e) {
        updateSyncBadge("⚠️ حُفظ على الجهاز فقط", "bg-amber-500/20 text-amber-300");
        return false;
    } finally {
        isSyncingNow = false;
    }
}

function saveAllLocal() {
    dailyMeetLinks.weeklySchedule = weeklySchedule;
    localStorage.setItem('g10_subjects_v10', JSON.stringify(syrianG10Subjects));
    localStorage.setItem('g10_weekly_schedule_v10', JSON.stringify(weeklySchedule));
    localStorage.setItem('g10_hosts_v10', JSON.stringify(broadcastHosts));
    localStorage.setItem('g10_lessons_v9', JSON.stringify(lessons));
    localStorage.setItem('g10_students_v9', JSON.stringify(students));
    localStorage.setItem('g10_quizzes_v9', JSON.stringify(quizzes));
    localStorage.setItem('g10_teachers_v9', JSON.stringify(teachers));
    localStorage.setItem('g10_logs_v9', JSON.stringify(teacherLogs));
    localStorage.setItem('g10_daily_meet_v9', JSON.stringify(dailyMeetLinks));
    localStorage.setItem('g10_admin_device_id', adminDeviceId);
}

function saveCloudUrl() {
    if (currentRole !== 'admin') return alert("⛔ غير مصرح! فقط المدير العام يمكنه تعديل إعدادات السحابة.");
    const url = document.getElementById('cloud-url').value.trim();
    if (!url) {
        alert("⚠️ لا يمكن ترك رابط السحابة فارغاً!");
        document.getElementById('cloud-url').value = DEFAULT_CLOUD_URL;
        return;
    }
    localStorage.setItem('g10_admin_cloud_url', url);
    fetchFromCloud(true, false, false, true);
    alert("✅ تم حفظ وتحديث رابط السحابة بنجاح!");
}

function resetCloudUrlToDefault() {
    if (currentRole !== 'admin') return;
    localStorage.removeItem('g10_admin_cloud_url');
    document.getElementById('cloud-url').value = DEFAULT_CLOUD_URL;
    fetchFromCloud(true, false, false, true);
}

// =========================================================================
// 10. البرنامج التفاعلي الأسبوعي (6 حصص + استراحتان + محرر المدير)
// =========================================================================
function renderWeeklySchedule() {
    const branchFilterEl = document.getElementById('schedule-branch-filter');
    if (!branchFilterEl) return;

    if (currentRole === 'student' && currentStudentProfile && branchFilterEl.dataset.autoSet !== currentStudentProfile.code) {
        branchFilterEl.value = currentStudentProfile.branch || "علمي";
        branchFilterEl.dataset.autoSet = currentStudentProfile.code;
    }
    const branchFilter = branchFilterEl.value;
    const times = weeklySchedule.periodTimes || defaultPeriodTimes;

    const tabsEl = document.getElementById('schedule-days-tabs');
    tabsEl.innerHTML = WEEK_DAYS.map((dayName, idx) => {
        const isToday = (idx === jsDayNow);
        const isSelected = (idx === selectedScheduleDay);
        const cls = isSelected
            ? 'bg-indigo-600 text-white shadow-md'
            : (isToday ? 'bg-emerald-100 text-emerald-900 border border-emerald-400' : 'bg-slate-100 text-slate-700 hover:bg-slate-200');
        return `<button onclick="selectScheduleDay(${idx})" class="${cls} px-4 py-2 rounded-xl text-xs md:text-sm font-extrabold transition flex items-center gap-1.5">
            <span>${dayName}</span>
            ${isToday ? '<span class="bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">اليوم</span>' : ''}
        </button>`;
    }).join('');

    const cardsWrap = document.getElementById('schedule-selected-day-cards');
    const daySlots = weeklySchedule.days[String(selectedScheduleDay)] || createEmptyDaySlots();

    function buildSlotCard(pIdx) {
        const slot = daySlots[pIdx] || { subject: "فراغ", teacher: "", branch: "علمي وأدبي" };
        const isFree = !slot.subject || slot.subject === "فراغ";
        const branchMatch = (branchFilter === "الكل") || isFree || slot.branch === "علمي وأدبي" || slot.branch === branchFilter;
        const teacherMatch = (!filterOnlyMyClasses) || (currentRole !== 'teacher') || (normalizeArabicName(slot.teacher) === normalizeArabicName(currentTeacherName));
        if (!branchMatch || !teacherMatch) return '';

        if (isFree) {
            return `<div class="p-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col justify-between">
                <div class="flex justify-between items-center text-xs text-slate-500 font-bold mb-2">
                    <span>الحصة ${pIdx + 1}</span>
                    <span dir="ltr" class="font-mono bg-slate-200 px-2 py-0.5 rounded">${times[pIdx] || ''}</span>
                </div>
                <div class="text-center py-2"><span class="text-lg">🌿</span><h4 class="font-extrabold text-slate-500 text-sm">حصة فراغ</h4></div>
            </div>`;
        }

        const bBadge = slot.branch === "أدبي"
            ? `<span class="bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 rounded font-bold">أدبي</span>`
            : (slot.branch === "علمي وأدبي"
                ? `<span class="bg-purple-100 text-purple-800 text-[11px] px-2 py-0.5 rounded font-bold">مشترك</span>`
                : `<span class="bg-sky-100 text-sky-800 text-[11px] px-2 py-0.5 rounded font-bold">علمي</span>`);

        return `<div onclick="jumpToSubjectFromSchedule('${escapeAttr(slot.subject)}')" class="cursor-pointer p-4 rounded-xl border border-indigo-200 bg-gradient-to-br from-white to-indigo-50/60 hover:border-indigo-500 hover:shadow-md transition flex flex-col justify-between">
            <div class="flex justify-between items-center text-xs mb-2">
                <span class="font-extrabold text-indigo-700">الحصة ${pIdx + 1}</span>
                <span dir="ltr" class="font-mono bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded font-bold">${times[pIdx] || ''}</span>
            </div>
            <div class="mb-2">
                <h4 class="text-base font-extrabold text-indigo-950">${slot.subject}</h4>
                <p class="text-xs text-slate-600 font-semibold mt-0.5">👨‍🏫 ${slot.teacher || 'أستاذ المادة'}</p>
            </div>
            <div class="flex justify-between items-center pt-2 border-t border-indigo-100 text-[11px]">
                ${bBadge}
                <span class="text-indigo-700 font-bold">عرض دروس المادة ←</span>
            </div>
        </div>`;
    }

    const g1 = [buildSlotCard(0), buildSlotCard(1)].filter(Boolean).join('');
    const g2 = [buildSlotCard(2), buildSlotCard(3)].filter(Boolean).join('');
    const g3 = [buildSlotCard(4), buildSlotCard(5)].filter(Boolean).join('');

    if (!g1 && !g2 && !g3) {
        cardsWrap.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm bg-slate-50 rounded-xl border">لا توجد حصص مطابقة للفلتر في هذا اليوم.</div>`;
    } else {
        cardsWrap.innerHTML = `
            ${g1 ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${g1}</div>` : ''}
            <div class="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-2 text-xs font-extrabold flex flex-wrap justify-between items-center gap-2">
                <span>☕ الاستراحة الأولى (15 دقيقة)</span>
                <span dir="ltr" class="font-mono bg-amber-200/80 px-2.5 py-0.5 rounded">${BREAK_1_TIME}</span>
            </div>
            ${g2 ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${g2}</div>` : ''}
            <div class="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-2 text-xs font-extrabold flex flex-wrap justify-between items-center gap-2">
                <span>☕ الاستراحة الثانية (15 دقيقة)</span>
                <span dir="ltr" class="font-mono bg-amber-200/80 px-2.5 py-0.5 rounded">${BREAK_2_TIME}</span>
            </div>
            ${g3 ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${g3}</div>` : ''}
        `;
    }

    const thead = document.getElementById('schedule-full-thead');
    const tbody = document.getElementById('schedule-full-tbody');

    thead.innerHTML = `<tr class="bg-indigo-950 text-white">
        <th class="p-2.5 text-right">اليوم</th>
        <th class="p-2">الحصة 1<br><span dir="ltr" class="text-[10px] text-amber-300 font-mono">${times[0]}</span></th>
        <th class="p-2">الحصة 2<br><span dir="ltr" class="text-[10px] text-amber-300 font-mono">${times[1]}</span></th>
        <th class="p-2 bg-amber-600/40 text-amber-200">استراحة 1<br><span dir="ltr" class="text-[10px] font-mono">${BREAK_1_TIME}</span></th>
        <th class="p-2">الحصة 3<br><span dir="ltr" class="text-[10px] text-amber-300 font-mono">${times[2]}</span></th>
        <th class="p-2">الحصة 4<br><span dir="ltr" class="text-[10px] text-amber-300 font-mono">${times[3]}</span></th>
        <th class="p-2 bg-amber-600/40 text-amber-200">استراحة 2<br><span dir="ltr" class="text-[10px] font-mono">${BREAK_2_TIME}</span></th>
        <th class="p-2">الحصة 5<br><span dir="ltr" class="text-[10px] text-amber-300 font-mono">${times[4]}</span></th>
        <th class="p-2">الحصة 6<br><span dir="ltr" class="text-[10px] text-amber-300 font-mono">${times[5]}</span></th>
    </tr>`;

    tbody.innerHTML = WEEK_DAYS.map((dayName, dIdx) => {
        const isToday = (dIdx === jsDayNow);
        const slots = weeklySchedule.days[String(dIdx)] || createEmptyDaySlots();
        const buildCell = (p) => {
            const s = slots[p] || { subject: "فراغ", teacher: "", branch: "علمي وأدبي" };
            const isFree = !s.subject || s.subject === "فراغ";
            const matchesBranch = (branchFilter === "الكل") || isFree || s.branch === "علمي وأدبي" || s.branch === branchFilter;
            if (isFree || !matchesBranch) return `<td class="p-2 text-slate-400 bg-slate-50/70 border-r border-slate-100">${isFree ? 'فراغ' : '—'}</td>`;
            return `<td onclick="jumpToSubjectFromSchedule('${escapeAttr(s.subject)}')" class="p-2 border-r border-slate-100 cursor-pointer hover:bg-indigo-100/70 transition">
                <div class="font-extrabold text-indigo-950">${s.subject}</div>
                <div class="text-[10px] text-slate-500">${s.teacher || ''}</div>
                <div class="text-[9px] font-bold ${s.branch === 'أدبي' ? 'text-amber-700' : 'text-sky-700'}">${s.branch}</div>
            </td>`;
        };
        return `<tr class="${isToday ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}">
            <td class="p-2.5 text-right font-extrabold text-indigo-950 whitespace-nowrap">${dayName} ${isToday ? '🟢' : ''}</td>
            ${buildCell(0)}${buildCell(1)}
            <td class="p-1.5 bg-amber-50/80 text-amber-800 font-bold text-[10px] border-r border-amber-200">☕ 15 د</td>
            ${buildCell(2)}${buildCell(3)}
            <td class="p-1.5 bg-amber-50/80 text-amber-800 font-bold text-[10px] border-r border-amber-200">☕ 15 د</td>
            ${buildCell(4)}${buildCell(5)}
        </tr>`;
    }).join('');

    renderTodayQuickStrip();
}

function renderTodayQuickStrip() {
    const strip = document.getElementById('today-quick-strip');
    if (!strip) return;
    const isWeekend = (jsDayNow === 5 || jsDayNow === 6);
    const displayDayIdx = isWeekend ? 0 : jsDayNow;
    const slots = weeklySchedule.days[String(displayDayIdx)] || createEmptyDaySlots();
    const times = weeklySchedule.periodTimes || defaultPeriodTimes;
    const studentBranch = (currentRole === 'student' && currentStudentProfile) ? currentStudentProfile.branch : "الكل";

    let pills = '';
    slots.forEach((s, idx) => {
        if (idx === 2) pills += `<span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg text-[11px] font-bold">☕ استراحة 09:30</span>`;
        if (idx === 4) pills += `<span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg text-[11px] font-bold">☕ استراحة 11:15</span>`;
        const isFree = !s.subject || s.subject === "فراغ";
        if (!isFree && studentBranch !== "الكل" && s.branch !== "علمي وأدبي" && s.branch !== studentBranch) return;
        pills += isFree
            ? `<span class="bg-slate-100 text-slate-400 border border-dashed border-slate-300 px-2.5 py-1 rounded-lg text-xs">ح${idx + 1}: فراغ</span>`
            : `<button onclick="jumpToSubjectFromSchedule('${escapeAttr(s.subject)}')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-200 px-3 py-1 rounded-lg text-xs font-bold transition"><span class="text-indigo-600">ح${idx + 1}</span> (${(times[idx] || '').split('-')[0].trim()}): ${s.subject}</button>`;
    });

    strip.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span class="text-xs font-extrabold text-indigo-950">⚡ ${isWeekend ? 'اليوم عطلة رسمية — برنامج يوم الأحد القادم:' : 'برنامج حصص اليوم (' + WEEK_DAYS[displayDayIdx] + '):'}</span>
            <button onclick="switchTab('schedule-tab', document.getElementById('nav-btn-schedule'))" class="text-xs text-indigo-700 font-bold hover:underline">عرض البرنامج الأسبوعي الكامل ↗</button>
        </div>
        <div class="flex flex-wrap gap-2">${pills}</div>
    `;
}

function selectScheduleDay(dayIdx) {
    selectedScheduleDay = dayIdx;
    renderWeeklySchedule();
}

function toggleMyClassesFilter() {
    filterOnlyMyClasses = !filterOnlyMyClasses;
    const btn = document.getElementById('schedule-my-classes-btn');
    btn.className = filterOnlyMyClasses
        ? "staff-only bg-amber-500 text-slate-950 px-3 py-2 rounded-lg font-extrabold transition shadow"
        : "staff-only bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-3 py-2 rounded-lg font-bold transition";
    renderWeeklySchedule();
}

function jumpToSubjectFromSchedule(subName) {
    filterLessons(subName);
    switchTab('subjects-tab', document.getElementById('nav-btn-subjects'));
}

function renderAdminScheduleEditor() {
    const daySelect = document.getElementById('admin-edit-day-select');
    const container = document.getElementById('admin-schedule-editor-rows');
    if (!daySelect || !container) return;

    const dayKey = daySelect.value;
    const slots = weeklySchedule.days[dayKey] || createEmptyDaySlots();
    const times = weeklySchedule.periodTimes || defaultPeriodTimes;

    let subjectOpts = `<option value="فراغ">🌿 حصة فراغ</option>`;
    syrianG10Subjects.forEach(s => { subjectOpts += `<option value="${escapeAttr(s.name)}">${s.name}</option>`; });

    container.innerHTML = '';
    for (let p = 0; p < 6; p++) {
        if (p === 2) container.innerHTML += `<div class="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-1.5 text-xs font-extrabold text-center">☕ الاستراحة الأولى (${BREAK_1_TIME} — 15 دقيقة)</div>`;
        if (p === 4) container.innerHTML += `<div class="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-1.5 text-xs font-extrabold text-center">☕ الاستراحة الثانية (${BREAK_2_TIME} — 15 دقيقة)</div>`;
        const slot = slots[p] || { subject: "فراغ", teacher: "", branch: "علمي وأدبي" };
        container.innerHTML += `
            <div class="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div class="md:col-span-2 font-extrabold text-indigo-950">الحصة ${p + 1}</div>
                <div class="md:col-span-2"><input type="text" id="ed-time-${p}" dir="ltr" value="${escapeAttr(times[p] || defaultPeriodTimes[p])}" class="w-full border rounded-lg p-2 bg-white text-center font-mono font-bold"></div>
                <div class="md:col-span-3"><select id="ed-sub-${p}" class="w-full border rounded-lg p-2 bg-white font-bold">${subjectOpts}</select></div>
                <div class="md:col-span-3"><input type="text" id="ed-teacher-${p}" value="${escapeAttr(slot.teacher || '')}" placeholder="اسم الأستاذ (اتركه فارغاً للفراغ)" class="w-full border rounded-lg p-2 bg-white"></div>
                <div class="md:col-span-2"><select id="ed-branch-${p}" class="w-full border rounded-lg p-2 bg-white font-bold"><option value="علمي">علمي</option><option value="أدبي">أدبي</option><option value="علمي وأدبي">علمي وأدبي</option></select></div>
            </div>`;
    }

    for (let p = 0; p < 6; p++) {
        const slot = slots[p] || { subject: "فراغ", teacher: "", branch: "علمي وأدبي" };
        document.getElementById(`ed-sub-${p}`).value = slot.subject || "فراغ";
        document.getElementById(`ed-branch-${p}`).value = slot.branch || "علمي وأدبي";
    }
}

async function saveAdminDaySchedule() {
    if (currentRole !== 'admin') return;
    const btn = document.getElementById('save-schedule-btn');
    const dayKey = document.getElementById('admin-edit-day-select').value;
    const newSlots = [];
    for (let p = 0; p < 6; p++) {
        weeklySchedule.periodTimes[p] = document.getElementById(`ed-time-${p}`).value.trim() || defaultPeriodTimes[p];
        const sub = document.getElementById(`ed-sub-${p}`).value;
        newSlots.push({
            subject: sub,
            teacher: sub === "فراغ" ? "" : document.getElementById(`ed-teacher-${p}`).value.trim(),
            branch: document.getElementById(`ed-branch-${p}`).value
        });
    }

    localWriteEpoch++;
    weeklySchedule.days[dayKey] = newSlots;
    dailyMeetLinks.weeklySchedule = weeklySchedule;

    teacherLogs.unshift({
        teacher: "المدير العام",
        action: `📅 تحديث برنامج يوم (${WEEK_DAYS[Number(dayKey)]}) الأسبوعي`,
        time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' })
    });
    if (teacherLogs.length > 50) teacherLogs.pop();

    isScheduleEditorDirty = false;
    saveAllLocal();
    renderWeeklySchedule();
    renderAdminDashboard();

    if (btn) { btn.disabled = true; btn.innerText = "⬆️ جارٍ التعميم في السحابة..."; }
    const ok = await syncToCloud(false);
    if (btn) { btn.disabled = false; btn.innerText = "💾 حفظ وتعميم برنامج هذا اليوم في السحابة"; }

    if (ok) alert(`✅ تم حفظ برنامج يوم (${WEEK_DAYS[Number(dayKey)]}) وتعميمه للطلاب والأساتذة بنجاح!`);
    else alert("⚠️ حُفظ البرنامج محلياً؛ اضغط (⬆️ رفع البيانات يدوياً) عند تحسن الإنترنت لتعميمه.");
}

// =========================================================================
// 11. دخول الأساتذة والمدير والتنقل بين التبويبات
// =========================================================================
async function openLoginModal(mode) {
    isStaffLoggingIn = true;
    loginMode = mode;
    const modal = document.getElementById('login-modal');
    const tFields = document.getElementById('teacher-login-fields');
    const aFields = document.getElementById('admin-login-fields');
    const title = document.getElementById('login-modal-title');
    document.getElementById('staff-security-alert').classList.add('hidden');

    document.getElementById('student-reg-modal').classList.add('hidden');
    document.getElementById('student-reg-modal').classList.remove('flex');
    tFields.classList.add('hidden');
    aFields.classList.add('hidden');

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (mode === 'teacher') {
        title.innerText = "👨‍🏫 دخول الأستاذ (محمي ببصمة الجهاز)";
        tFields.classList.remove('hidden');
        const select = document.getElementById('login-teacher-select');
        select.innerHTML = '<option value="">⏳ جارٍ جلب أسماء الأساتذة من السحابة...</option>';
        document.getElementById('login-teacher-pin').value = '';
        await fetchFromCloud(false, true, true, true);
        select.innerHTML = teachers.map((t, i) => `<option value="${i}">${t.name} (${t.subject})</option>`).join('');
    } else {
        title.innerText = "👑 دخول المدير العام (محمي ببصمة الجهاز)";
        aFields.classList.remove('hidden');
        document.getElementById('login-admin-pin').value = '';
    }
}

function closeLoginModalSuccess() {
    isStaffLoggingIn = false;
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('login-modal').classList.remove('flex');
    document.getElementById('student-reg-modal').classList.add('hidden');
    document.getElementById('student-reg-modal').classList.remove('flex');
}

function cancelStaffLogin() {
    isStaffLoggingIn = false;
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('login-modal').classList.remove('flex');
    if (currentRole === 'student' && !currentStudentProfile) {
        openStudentRegModal(false, true, "⚠️ تنبيه: تم إلغاء الدخول. يرجى إدخال رمز الطالب المعتمد أولاً!");
    }
}

async function confirmStaffLogin() {
    isStaffLoggingIn = true;
    const btn = document.getElementById('staff-login-submit-btn');
    const staffAlert = document.getElementById('staff-security-alert');
    staffAlert.classList.add('hidden');
    btn.disabled = true;
    btn.innerText = "⏳ جارٍ التحقق من بصمة الجهاز...";

    await fetchFromCloud(false, true, true, true);
    const nowStr = new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' });

    if (loginMode === 'teacher') {
        const idx = document.getElementById('login-teacher-select').value;
        const pin = normalizeSecretText(document.getElementById('login-teacher-pin').value);
        const teacher = teachers[idx];

        if (teacher && normalizeSecretText(teacher.pin) === pin) {
            if (teacher.deviceId && teacher.deviceId !== "" && teacher.deviceId !== THIS_DEVICE_ID) {
                localWriteEpoch++;
                teacherLogs.unshift({ teacher: teacher.name, action: "⛔ محاولة دخول مرفوضة من جهاز غريب (حماية الاختراق)", time: nowStr });
                if (teacherLogs.length > 50) teacherLogs.pop();
                saveAllLocal();
                renderAdminDashboard();
                await syncToCloud(false);

                btn.disabled = false;
                btn.innerText = "دخول وتحقق من بصمة الجهاز";
                staffAlert.innerText = `⛔ تم رفض الدخول! حساب (${teacher.name}) مقفل ومرتبط بهاتف/جهاز آخر. يجب فك القفل من لوحة المدير أولاً.`;
                staffAlert.classList.remove('hidden');
                return;
            }

            const isFirstBind = !teacher.deviceId || teacher.deviceId === "";
            localWriteEpoch++;
            teachers[idx].deviceId = THIS_DEVICE_ID;
            currentRole = "teacher";
            currentTeacherName = teacher.name;
            sessionStorage.setItem('g10_staff_session', JSON.stringify({ role: 'teacher', name: teacher.name }));

            teacherLogs.unshift({
                teacher: teacher.name,
                action: isFirstBind ? `تسجيل دخول وربط بصمة جهازه لأول مرة (${teacher.subject})` : `تسجيل دخول آمن من جهازه المعتمد (${teacher.subject})`,
                time: nowStr
            });
            if (teacherLogs.length > 50) teacherLogs.pop();

            saveAllLocal();
            applyRoleUI();
            renderWeeklySchedule();
            renderAdminDashboard();
            renderLessons();
            renderQuizzes();
            await syncToCloud(false);

            btn.disabled = false;
            btn.innerText = "دخول وتحقق من بصمة الجهاز";
            closeLoginModalSuccess();
            switchTab('subjects-tab', document.getElementById('nav-btn-subjects'));
        } else {
            btn.disabled = false;
            btn.innerText = "دخول وتحقق من بصمة الجهاز";
            alert("❌ الرقم السري غير صحيح لهذا الأستاذ!");
        }
    } else {
        const pin = normalizeSecretText(document.getElementById('login-admin-pin').value);
        if (pin === normalizeSecretText(adminPin)) {
            if (adminDeviceId && adminDeviceId !== "" && adminDeviceId !== THIS_DEVICE_ID) {
                localWriteEpoch++;
                teacherLogs.unshift({ teacher: "المدير العام", action: "🚨 محاولة اختراق مرفوضة لحساب المدير من جهاز غريب!", time: nowStr });
                if (teacherLogs.length > 50) teacherLogs.pop();
                saveAllLocal();
                renderAdminDashboard();
                await syncToCloud(false);

                btn.disabled = false;
                btn.innerText = "دخول وتحقق من بصمة الجهاز";
                staffAlert.innerText = "⛔ حماية قصوى: حساب المدير العام مرتبط ومقفل على جهاز المدير الشخصي فقط!";
                staffAlert.classList.remove('hidden');
                return;
            }

            const isFirstAdminBind = !adminDeviceId || adminDeviceId === "";
            localWriteEpoch++;
            adminDeviceId = THIS_DEVICE_ID;
            currentRole = "admin";
            currentTeacherName = "المدير العام";
            sessionStorage.setItem('g10_staff_session', JSON.stringify({ role: 'admin', name: 'المدير العام' }));

            if (isFirstAdminBind) {
                teacherLogs.unshift({ teacher: "المدير العام", action: "🔒 تم قفل حساب المدير العام وربطه ببصمة هذا الجهاز حصرياً", time: nowStr });
                if (teacherLogs.length > 50) teacherLogs.pop();
            }

            saveAllLocal();
            applyRoleUI();
            closeLoginModalSuccess();
            renderWeeklySchedule();
            renderLessons();
            renderQuizzes();
            if (!isScheduleEditorDirty) renderAdminScheduleEditor();
            renderAdminDashboard();
            await syncToCloud(false);

            btn.disabled = false;
            btn.innerText = "دخول وتحقق من بصمة الجهاز";
            switchTab('admin-tab', document.getElementById('nav-btn-admin'));
        } else {
            btn.disabled = false;
            btn.innerText = "دخول وتحقق من بصمة الجهاز";
            alert("❌ كلمة مرور المدير العام غير صحيحة!");
        }
    }
}

function logoutUser() {
    sessionStorage.removeItem('g10_staff_session');
    currentRole = "student";
    currentTeacherName = "";
    currentHostCode = "";
    filterOnlyMyClasses = false;
    isScheduleEditorDirty = false;
    applyRoleUI();
    switchTab('subjects-tab', document.getElementById('nav-btn-subjects'));
    renderWeeklySchedule();
    renderLessons();
    renderQuizzes();
    verifyActiveUserDeviceSession();
}

function updateHeaderButtons() {
    const tBtn = document.getElementById('teacher-login-btn');
    const aBtn = document.getElementById('admin-login-btn');
    const outBtn = document.getElementById('logout-btn');
    const quizNote = document.getElementById('student-quiz-note');

    if (currentRole === 'student') {
        tBtn.style.display = currentStudentProfile ? 'none' : 'inline-flex';
        aBtn.style.display = currentStudentProfile ? 'none' : 'inline-flex';
        outBtn.style.display = 'none';
        quizNote.style.display = 'block';
    } else {
        tBtn.style.display = 'none';
        aBtn.style.display = 'none';
        outBtn.style.display = 'inline-flex';
        quizNote.style.display = 'none';
    }
}

function switchTab(tabId, btnElement) {
    if (tabId === 'admin-tab' && currentRole !== 'admin') return alert("⛔ هذا القسم مخصص للمدير العام فقط!");
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('text-indigo-200');
    });
    if (btnElement) {
        btnElement.classList.add('bg-indigo-600', 'text-white');
        btnElement.classList.remove('text-indigo-200');
    }
    if (tabId === 'prep-tab') { enforceTeacherSubjectLock(); restoreLessonDraftIfAny(); }
    if (tabId === 'schedule-tab') renderWeeklySchedule();
    if (tabId === 'attendance-tab') renderStudents();
    if (tabId === 'admin-tab') { if (!isScheduleEditorDirty) renderAdminScheduleEditor(); renderAdminDashboard(); }
}

// =========================================================================
// 12. المواد والدروس ومشغّل الفيديو
// =========================================================================
function renderSubjects() {
    const grid = document.getElementById('subjects-grid');
    const quizSelect = document.getElementById('quiz-sub');
    const newTSub = document.getElementById('new-t-subject');
    grid.innerHTML = '';
    quizSelect.innerHTML = '';
    newTSub.innerHTML = '';

    syrianG10Subjects.forEach((sub, idx) => {
        const driveBtnHtml = (sub.driveUrl && sub.driveUrl.trim() !== "")
            ? `<a href="${escapeAttr(sub.driveUrl.trim())}" target="_blank" onclick="event.stopPropagation()" class="mt-1.5 inline-flex items-center gap-1 text-[10px] bg-white/90 hover:bg-white text-indigo-900 px-2 py-0.5 rounded shadow-sm font-extrabold border border-indigo-200">📁 Drive المادة ↗</a>`
            : `<span class="text-[11px] opacity-75 block">أرشيف الدروس</span>`;

        grid.innerHTML += `
            <div onclick="filterLessons('${escapeAttr(sub.name)}')" class="cursor-pointer p-3 rounded-xl border ${sub.color || subjectColorPalettes[idx % subjectColorPalettes.length]} shadow-sm flex items-center gap-2.5 hover:scale-[1.02] transition text-right">
                <span class="text-2xl">${sub.icon || '📘'}</span>
                <div class="truncate flex-1"><h4 class="font-bold text-xs md:text-sm truncate">${sub.name}</h4>${driveBtnHtml}</div>
            </div>`;
        const opt = `<option value="${escapeAttr(sub.name)}">${sub.name}</option>`;
        quizSelect.innerHTML += opt;
        newTSub.innerHTML += opt;
    });

    enforceTeacherSubjectLock();
}

async function addSubjectByAdmin(e) {
    e.preventDefault();
    if (currentRole !== 'admin') return;
    const name = document.getElementById('new-sub-name').value.trim();
    const icon = document.getElementById('new-sub-icon').value;
    const driveUrl = document.getElementById('new-sub-drive').value.trim();
    if (!name) return;
    if (syrianG10Subjects.some(s => s.name === name)) return alert("⚠️ هذه المادة موجودة مسبقاً في المنهاج!");

    localWriteEpoch++;
    syrianG10Subjects.push({ name, icon, color: subjectColorPalettes[syrianG10Subjects.length % subjectColorPalettes.length], driveUrl });
    teacherLogs.unshift({ teacher: "المدير العام", action: `📚 إضافة مادة جديدة للمنهاج (${name})`, time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) });
    if (teacherLogs.length > 50) teacherLogs.pop();

    e.target.reset();
    saveAllLocal();
    renderSubjects();
    if (!isScheduleEditorDirty) renderAdminScheduleEditor();
    renderAdminDashboard();
    await syncToCloud(false);
    alert(`✅ تم إضافة مادة (${name}) إلى المنهاج ومزامنتها بنجاح!`);
}

async function editSubjectDriveUrl(idx) {
    if (currentRole !== 'admin') return;
    const sub = syrianG10Subjects[idx];
    const newUrl = prompt(`📁 الصق رابط مجلد Google Drive الخاص بمادة (${sub.name}) ووظائفها:`, sub.driveUrl || "");
    if (newUrl === null) return;
    localWriteEpoch++;
    syrianG10Subjects[idx].driveUrl = newUrl.trim();
    saveAllLocal();
    renderSubjects();
    renderAdminDashboard();
    await syncToCloud(false);
    alert(`✅ تم تحديث رابط الـ Drive لمادة (${sub.name})!`);
}

async function removeSubjectByAdmin(idx) {
    if (currentRole !== 'admin') return;
    const sub = syrianG10Subjects[idx];
    if (!confirm(`هل أنت متأكد من حذف مادة (${sub.name}) من المنهاج؟`)) return;
    localWriteEpoch++;
    syrianG10Subjects.splice(idx, 1);
    teacherLogs.unshift({ teacher: "المدير العام", action: `🗑️ حذف مادة (${sub.name}) من المنهاج`, time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) });
    if (teacherLogs.length > 50) teacherLogs.pop();
    saveAllLocal();
    renderSubjects();
    if (!isScheduleEditorDirty) renderAdminScheduleEditor();
    renderAdminDashboard();
    await syncToCloud(false);
}

async function addBroadcastLaptop(e) {
    e.preventDefault();
    if (currentRole !== 'admin') return;
    const code = normalizeSecretText(document.getElementById('new-host-code').value);
    const name = document.getElementById('new-host-name').value.trim();
    const pin = document.getElementById('new-host-pin').value.trim();
    if (!/^H\d+$/.test(code)) return alert("⚠️ يجب أن يبدأ رمز لابتوب البث بحرف H متبوعاً برقم (مثال: H4)!");
    if (broadcastHosts.some(h => normalizeSecretText(h.code) === code)) return alert("⚠️ هذا الرمز مسجل مسبقاً للابتوب بث آخر!");
    localWriteEpoch++;
    broadcastHosts.push({ code, name, pin, deviceId: "", lastSeen: "-" });
    e.target.reset();
    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
    alert(`✅ تم إضافة حساب لابتوب البث (${code} - ${name}) بنجاح!`);
}

async function changeHostPin(idx) {
    if (currentRole !== 'admin') return;
    const h = broadcastHosts[idx];
    const newPin = prompt(`🔑 أدخل كلمة السر الجديدة للابتوب البث (${h.code} - ${h.name}):`, h.pin);
    if (newPin === null || newPin.trim() === "") return;
    localWriteEpoch++;
    broadcastHosts[idx].pin = newPin.trim();
    teacherLogs.unshift({ teacher: "المدير العام", action: `🔑 تغيير كلمة السر للابتوب البث (${h.code})`, time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) });
    if (teacherLogs.length > 50) teacherLogs.pop();
    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
    alert(`✅ تم تغيير كلمة السر للابتوب البث (${h.code})!`);
}

async function changeHostName(idx) {
    if (currentRole !== 'admin') return;
    const h = broadcastHosts[idx];
    const newName = prompt(`✏️ أدخل الاسم الجديد للابتوب البث (${h.code}):`, h.name);
    if (newName === null || newName.trim() === "") return;
    localWriteEpoch++;
    broadcastHosts[idx].name = newName.trim();
    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
}

async function resetHostDeviceLock(idx) {
    const h = broadcastHosts[idx];
    if (!confirm(`هل تريد فك ارتباط الجهاز للابتوب البث (${h.code} - ${h.name})؟`)) return;
    localWriteEpoch++;
    broadcastHosts[idx].deviceId = "";
    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
    alert(`✅ تم فك قفل لابتوب البث (${h.code})!`);
}

async function removeHostAccount(idx) {
    if (!confirm("هل تريد حذف حساب لابتوب البث هذا؟")) return;
    localWriteEpoch++;
    broadcastHosts.splice(idx, 1);
    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
}

async function changeTeacherPin(idx) {
    if (currentRole !== 'admin') return;
    const t = teachers[idx];
    const newPin = prompt(`🔑 أدخل الرمز السري الجديد للأستاذ (${t.name}):`, t.pin);
    if (newPin === null || newPin.trim() === "") return;
    localWriteEpoch++;
    teachers[idx].pin = newPin.trim();
    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
    alert(`✅ تم تحديث الرمز السري للأستاذ (${t.name})!`);
}

function filterLessons(sub) {
    currentSubjectFilter = sub;
    document.getElementById('current-filter-badge').innerText = sub;
    renderLessons();
}

function insertMath(latex) {
    const area = document.getElementById('prep-notes');
    area.value += " " + latex + " ";
    area.focus();
    saveLessonDraft();
}

function renderLessons() {
    const tbody = document.getElementById('lessons-table-body');
    tbody.innerHTML = '';
    const filtered = currentSubjectFilter === "الكل" ? lessons : lessons.filter(l => l.subject === currentSubjectFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-400">لا توجد دروس محضّرة حالياً في هذا القسم.</td></tr>`;
        return;
    }

    const isStaff = (currentRole === 'admin' || currentRole === 'teacher');

    filtered.forEach((lesson) => {
        const realIdx = lessons.indexOf(lesson);
        const branchBadge = lesson.branch === "أدبي"
            ? `<span class="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded font-bold">أدبي</span>`
            : (lesson.branch === "علمي وأدبي" ? `<span class="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded font-bold">علمي وأدبي</span>` : `<span class="bg-sky-100 text-sky-800 text-xs px-2 py-0.5 rounded font-bold">علمي</span>`);

        const canEditThisSubject = currentRole === 'admin' || (currentRole === 'teacher' && (isAlaaSpecialTeacher(currentTeacherName) || normalizeArabicName(lesson.teacher) === normalizeArabicName(currentTeacherName)));
        const editSubBtn = canEditThisSubject
            ? `<button onclick="editLessonSubject(${realIdx})" class="mt-1 inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded text-[10px] font-bold">✏️ المادة</button>`
            : '';

        let pdfCellHtml = `<span class="text-xs text-slate-400">لا يوجد</span>`;
        if (lesson.pdf && lesson.pdf.trim() !== "") {
            pdfCellHtml = `<div class="flex items-center justify-center gap-1">
                <a href="${escapeAttr(lesson.pdf.trim())}" target="_blank" class="bg-amber-100 hover:bg-amber-200 text-amber-900 px-2.5 py-1 rounded-lg font-bold text-xs whitespace-nowrap">📄 فتح الملخص / الوظيفة</a>
                ${isStaff ? `<button onclick="attachLessonPdf(${realIdx})" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-1 rounded text-xs">✏️</button>` : ''}
            </div>`;
        } else if (isStaff) {
            pdfCellHtml = `<button onclick="attachLessonPdf(${realIdx})" class="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-lg font-bold text-xs whitespace-nowrap transition">📄 + رفع ملخص/وظيفة Drive</button>`;
        }

        let videoCellHtml = `<span class="text-xs text-slate-400">يُرفع بعد الحصة</span>`;
        if (lesson.video && lesson.video.trim() !== "") {
            videoCellHtml = `<div class="flex items-center justify-center gap-1">
                <button onclick="openVideoPlayerByIdx(${realIdx})" class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm whitespace-nowrap transition">▶️ مشاهدة التسجيل</button>
                ${isStaff ? `<button onclick="attachLessonRecording(${realIdx})" class="bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-1 rounded text-xs font-bold">✏️</button>` : ''}
            </div>`;
        } else if (isStaff) {
            videoCellHtml = `<button onclick="attachLessonRecording(${realIdx})" class="bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 px-2.5 py-1 rounded-lg font-bold text-xs whitespace-nowrap transition">🎬 + رفع رابط التسجيل (Drive)</button>`;
        }

        const delBtn = isStaff ? `<button onclick="deleteLesson(${realIdx})" class="bg-rose-100 hover:bg-rose-200 text-rose-700 px-2 py-1 rounded-lg text-xs font-bold">🗑️</button>` : '';

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50">
                <td class="p-3 font-extrabold text-indigo-950"><div>${lesson.subject}</div>${editSubBtn}</td>
                <td class="p-3 whitespace-nowrap">${branchBadge}</td>
                <td class="p-3 text-xs font-bold text-amber-800">${lesson.teacher || 'الإدارة'}</td>
                <td class="p-3 font-bold">${lesson.title}</td>
                <td class="p-3 text-slate-700">${lesson.notes}</td>
                <td class="p-3 text-slate-500 text-xs whitespace-nowrap">${lesson.date}</td>
                <td class="p-3 text-center whitespace-nowrap">${pdfCellHtml}</td>
                <td class="p-3 text-center whitespace-nowrap">${videoCellHtml}</td>
                <td class="p-3 text-center"><div class="flex items-center justify-center gap-1"><button onclick="shareWhatsApp(${realIdx})" class="bg-green-100 hover:bg-green-200 text-green-800 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap">📲 واتساب</button>${delBtn}</div></td>
            </tr>`;
    });
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
}

async function editLessonSubject(index) {
    const lesson = lessons[index];
    if (!lesson) return;
    let availableSubjects = syrianG10Subjects.map(s => s.name);
    if (currentRole === 'teacher' && isAlaaSpecialTeacher(currentTeacherName)) {
        availableSubjects = ["اللغة العربية", "التربية الدينية"];
    }
    const chosen = prompt(`✏️ تصحيح اسم المادة لدرس: "${lesson.title}"\nالمادة الحالية: ${lesson.subject}\n\n(${availableSubjects.join(' - ')})`, lesson.subject);
    if (!chosen || chosen.trim() === "") return;
    const cleanChosen = chosen.trim();
    if (currentRole === 'teacher' && isAlaaSpecialTeacher(currentTeacherName) && !["اللغة العربية", "التربية الدينية"].includes(cleanChosen)) {
        return alert("⚠️ يمكنك التبديل بين (اللغة العربية) و(التربية الدينية) فقط!");
    }
    localWriteEpoch++;
    const oldSub = lesson.subject;
    lessons[index].subject = cleanChosen;
    teacherLogs.unshift({ teacher: currentTeacherName || "الإدارة", action: `✏️ تعديل مادة الدرس (${lesson.title}) من (${oldSub}) إلى (${cleanChosen})`, time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) });
    if (teacherLogs.length > 50) teacherLogs.pop();
    saveAllLocal();
    renderLessons();
    renderAdminDashboard();
    await syncToCloud(false);
    alert(`✅ تم تصحيح مادة الدرس إلى (${cleanChosen})!`);
}

async function attachLessonRecording(index) {
    const newUrl = prompt("🎬 الصق رابط تسجيل الدرس من Google Drive أو YouTube بعد انتهاء الحصة:", lessons[index].video || "");
    if (newUrl === null) return;
    localWriteEpoch++;
    lessons[index].video = newUrl.trim();
    teacherLogs.unshift({ teacher: currentTeacherName || "الأستاذ", action: `رفع رابط تسجيل الدرس (${lessons[index].subject}: ${lessons[index].title})`, time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) });
    if (teacherLogs.length > 50) teacherLogs.pop();
    saveAllLocal();
    renderLessons();
    renderAdminDashboard();
    await syncToCloud(false);
    if (newUrl.trim() !== "") alert("✅ تم حفظ رابط التسجيل ومزامنته!");
}

async function attachLessonPdf(index) {
    const newUrl = prompt("📄 الصق رابط ملف الملخص أو الوظيفة من Google Drive:", lessons[index].pdf || "");
    if (newUrl === null) return;
    localWriteEpoch++;
    lessons[index].pdf = newUrl.trim();
    teacherLogs.unshift({ teacher: currentTeacherName || "الأستاذ", action: `رفع ملف ملخص/وظيفة Drive لدرس (${lessons[index].subject}: ${lessons[index].title})`, time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) });
    if (teacherLogs.length > 50) teacherLogs.pop();
    saveAllLocal();
    renderLessons();
    renderAdminDashboard();
    await syncToCloud(false);
    if (newUrl.trim() !== "") alert("✅ تم حفظ رابط الملخص/الوظيفة ومزامنته!");
}

function openVideoPlayerByIdx(idx) {
    const l = lessons[idx];
    if (!l || !l.video) return;
    openVideoPlayer(l.video.trim(), `${l.subject || ''} - ${l.title || ''}`);
}

function openVideoPlayer(videoUrl, title) {
    const modal = document.getElementById('video-player-modal');
    const container = document.getElementById('video-iframe-container');
    document.getElementById('video-modal-title').innerText = "🎬 " + title;
    document.getElementById('video-external-link').href = videoUrl;

    let embedUrl = "";
    const ytMatch = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    const driveMatch = videoUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);

    if (ytMatch && ytMatch[1]) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`;
    else if (driveMatch && driveMatch[1]) embedUrl = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;

    if (embedUrl) {
        container.innerHTML = `<iframe src="${embedUrl}" class="w-full h-full border-0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        window.open(videoUrl, '_blank');
    }
}

function closeVideoPlayer() {
    document.getElementById('video-iframe-container').innerHTML = '';
    document.getElementById('video-player-modal').classList.add('hidden');
    document.getElementById('video-player-modal').classList.remove('flex');
}

async function saveLesson(event) {
    event.preventDefault();
    enforceTeacherSubjectLock();
    const sub = document.getElementById('prep-subject').value;
    const branch = document.getElementById('prep-branch').value;
    const title = document.getElementById('prep-title').value;
    const nowStr = new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' });

    if (currentRole === 'admin' || isAlaaSpecialTeacher(currentTeacherName)) {
        if (!confirm(`⚠️ تأكيد نشر الدرس:\nالمادة: (${sub})\nالفرع: (${branch})\nالعنوان: (${title})\n\nهل اسم المادة صحيح وتود حفظ الدرس؟`)) return;
    }

    localWriteEpoch++;
    lessons.unshift({
        subject: sub,
        branch: branch,
        teacher: currentTeacherName || "أستاذ المادة",
        date: document.getElementById('prep-date').value,
        title: title,
        notes: document.getElementById('prep-notes').value,
        pdf: document.getElementById('prep-pdf').value.trim(),
        video: document.getElementById('prep-video').value.trim()
    });

    teacherLogs.unshift({ teacher: currentTeacherName || "المدير", action: `تحضير درس (${sub} - ${branch}: ${title})`, time: nowStr });
    if (teacherLogs.length > 50) teacherLogs.pop();

    localStorage.removeItem(getDraftStorageKey());
    updateDraftBadgeUI(null);
    saveAllLocal();
    renderLessons();
    renderAdminDashboard();

    document.getElementById('prep-title').value = '';
    document.getElementById('prep-notes').value = '';
    document.getElementById('prep-pdf').value = '';
    document.getElementById('prep-video').value = '';
    document.getElementById('prep-date').value = getTodayISO(0);
    enforceTeacherSubjectLock();

    await syncToCloud(false);
    alert(`✅ تم حفظ تحضير الدرس بنجاح تحت مادة (${sub})!`);
    switchTab('subjects-tab', document.getElementById('nav-btn-subjects'));
}

async function deleteLesson(index) {
    if (!confirm("هل تريد بالتأكيد حذف هذا الدرس؟")) return;
    localWriteEpoch++;
    lessons.splice(index, 1);
    saveAllLocal();
    renderLessons();
    renderAdminDashboard();
    await syncToCloud(false);
}

function shareWhatsApp(index) {
    const l = lessons[index];
    const dailyMeet = (l.branch === 'أدبي' && dailyMeetLinks.lit) ? dailyMeetLinks.lit : dailyMeetLinks.sci;
    let text = `🎓 *ملخص وتفاصيل درس - الصف العاشر (${l.branch || 'علمي'})*\n📚 *المادة:* ${l.subject}\n👨‍🏫 *الأستاذ:* ${l.teacher || 'الإدارة'}\n📌 *عنوان الدرس:* ${l.title}\n📝 *الشرح والوظيفة:* ${l.notes}\n📅 *التاريخ:* ${l.date}`;
    if (l.video) text += `\n\n🎬 *رابط مشاهدة تسجيل الدرس:*\n${l.video}`;
    if (l.pdf) text += `\n\n📄 *رابط الملخص / الوظيفة (Drive):*\n${l.pdf}`;
    if (!l.video && !l.pdf && dailyMeet) text += `\n\n📹 *رابط قاعة الدوام المباشرة:*\n${dailyMeet}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

// =========================================================================
// 13. لوحة المدير العام
// =========================================================================
function renderAdminDashboard() {
    const lastSchoolDay = getLastSchoolDayISO();
    const presentLastDay = students.filter(s => s.attendance && s.attendance[lastSchoolDay] && s.attendance[lastSchoolDay].present).length;

    document.getElementById('stat-subjects').innerText = syrianG10Subjects.length;
    document.getElementById('stat-teachers').innerText = teachers.length;
    document.getElementById('stat-hosts').innerText = broadcastHosts.length;
    document.getElementById('stat-lessons').innerText = lessons.length;
    document.getElementById('stat-students').innerText = `${students.length} (${presentLastDay} حاضر)`;

    const adminDevStatus = document.getElementById('admin-device-status');
    if (adminDevStatus) {
        adminDevStatus.innerText = adminDeviceId
            ? `🔒 مقفل على جهاز المدير المعتمد (${adminDeviceId.substring(0, 10)}...)`
            : `⏳ غير مقفل حالياً (سيُقفل تلقائياً عند أول دخول للمدير)`;
    }

    const subTbody = document.getElementById('admin-subjects-tbody');
    if (subTbody) {
        subTbody.innerHTML = syrianG10Subjects.map((sub, i) => {
            const lCount = lessons.filter(l => l.subject === sub.name).length;
            const driveStatus = (sub.driveUrl && sub.driveUrl.trim() !== "")
                ? `<a href="${escapeAttr(sub.driveUrl.trim())}" target="_blank" class="text-emerald-700 font-bold hover:underline">📂 فتح مجلد المادة ↗</a>`
                : `<span class="text-slate-400">غير محدد</span>`;
            return `<tr class="hover:bg-slate-50">
                <td class="p-2.5 text-slate-400 font-bold">${i + 1}</td>
                <td class="p-2.5 font-extrabold text-indigo-950">${sub.icon || '📘'} ${sub.name}</td>
                <td class="p-2.5"><div class="flex items-center gap-2">${driveStatus}<button onclick="editSubjectDriveUrl(${i})" class="bg-amber-100 hover:bg-amber-200 text-amber-900 px-2 py-0.5 rounded text-[11px] font-bold">✏️ رابط Drive</button></div></td>
                <td class="p-2.5 text-center font-bold">${lCount}</td>
                <td class="p-2.5 text-center"><button onclick="removeSubjectByAdmin(${i})" class="bg-rose-100 hover:bg-rose-200 text-rose-700 px-2.5 py-1 rounded font-bold">🗑️ حذف المادة</button></td>
            </tr>`;
        }).join('');
    }

    const hBody = document.getElementById('hosts-list-body');
    if (hBody) {
        hBody.innerHTML = broadcastHosts.map((h, i) => {
            const hDeviceHtml = h.deviceId
                ? `<div class="flex items-center justify-center gap-1"><span class="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-bold">🔒 مرتبط بلابتوب</span><button onclick="resetHostDeviceLock(${i})" class="bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] px-2 py-0.5 rounded font-bold">🔓 فك القفل</button></div>`
                : `<span class="bg-slate-100 text-slate-400 text-[10px] px-2 py-0.5 rounded">بانتظار الدخول</span>`;
            return `<tr class="hover:bg-slate-50">
                <td class="p-2.5 font-mono font-extrabold text-cyan-800">${h.code}</td>
                <td class="p-2.5 font-bold">${h.name} <button onclick="changeHostName(${i})" class="text-slate-400 hover:text-indigo-700 mr-1">✏️</button></td>
                <td class="p-2.5 whitespace-nowrap"><code class="bg-cyan-100 px-2 py-0.5 rounded font-bold">${h.pin}</code> <button onclick="changeHostPin(${i})" class="bg-indigo-100 hover:bg-indigo-200 text-indigo-900 text-[10px] px-2 py-0.5 rounded font-bold mr-1">🔑 تغيير السر</button></td>
                <td class="p-2.5 text-center whitespace-nowrap">${hDeviceHtml}</td>
                <td class="p-2.5 text-center text-slate-500">${h.lastSeen || '-'}</td>
                <td class="p-2.5 text-center"><button onclick="removeHostAccount(${i})" class="text-rose-500 font-bold">✖</button></td>
            </tr>`;
        }).join('');
    }

    document.getElementById('teachers-list-body').innerHTML = teachers.map((t, i) => {
        const count = lessons.filter(l => l.teacher === t.name).length;
        const tDeviceHtml = t.deviceId
            ? `<div class="flex items-center justify-center gap-1"><span class="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.5 rounded font-bold">🔒 مقفل</span><button onclick="resetTeacherDeviceLock(${i})" class="bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.5 rounded font-bold">🔓 فك</button></div>`
            : `<span class="bg-slate-100 text-slate-400 text-[10px] px-1.5 py-0.5 rounded">بانتظار الدخول</span>`;
        return `<tr>
            <td class="p-2 font-bold">${t.name}</td>
            <td class="p-2 text-indigo-800 font-semibold">${t.subject}</td>
            <td class="p-2 whitespace-nowrap"><code class="bg-amber-100 px-1.5 py-0.5 rounded font-bold">${t.pin}</code> <button onclick="changeTeacherPin(${i})" class="bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] px-1.5 py-0.5 rounded font-bold mr-1">🔑</button></td>
            <td class="p-2 text-center whitespace-nowrap">${tDeviceHtml}</td>
            <td class="p-2 text-center font-bold">${count}</td>
            <td class="p-2 text-center"><button onclick="removeTeacher(${i})" class="text-rose-500 font-bold">✖</button></td>
        </tr>`;
    }).join('');

    document.getElementById('teacher-logs-body').innerHTML = teacherLogs.map(log => {
        const isDanger = log.action && (log.action.includes('⛔') || log.action.includes('🚨'));
        const isWarn = log.action && log.action.includes('⚠️');
        const rowClass = isDanger ? 'bg-rose-50 text-rose-900 font-extrabold' : (isWarn ? 'bg-amber-50 text-amber-900 font-bold' : '');
        return `<tr class="${rowClass}"><td class="p-2.5 font-bold text-indigo-950">${log.teacher}</td><td class="p-2.5 ${isDanger ? 'text-rose-700' : 'text-slate-700'}">${log.action}</td><td class="p-2.5 text-slate-400">${log.time}</td></tr>`;
    }).join('');
}

async function resetTeacherDeviceLock(idx) {
    const t = teachers[idx];
    if (!confirm(`هل تريد فك ارتباط الجهاز للأستاذ (${t.name})؟`)) return;
    localWriteEpoch++;
    teachers[idx].deviceId = "";
    teacherLogs.unshift({ teacher: "المدير العام", action: `🔓 فك قفل الجهاز للأستاذ (${t.name})`, time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) });
    if (teacherLogs.length > 50) teacherLogs.pop();
    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
    alert(`✅ تم فك قفل الجهاز للأستاذ (${t.name})!`);
}

async function resetAdminDeviceLock() {
    if (!confirm("هل تريد فك ارتباط حساب المدير العام عن هذا الجهاز؟")) return;
    localWriteEpoch++;
    adminDeviceId = "";
    localStorage.removeItem('g10_admin_device_id');
    teacherLogs.unshift({ teacher: "المدير العام", action: "🔓 تم فك قفل جهاز المدير العام استعداداً لنقله لجهاز جديد", time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) });
    if (teacherLogs.length > 50) teacherLogs.pop();
    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
    alert("✅ تم فك ارتباط جهاز المدير بنجاح!");
}

async function addTeacherAccount(e) {
    e.preventDefault();
    localWriteEpoch++;
    const name = document.getElementById('new-t-name').value.trim();
    const sub = document.getElementById('new-t-subject').value;
    const pin = document.getElementById('new-t-pin').value.trim();
    teachers.push({ name, subject: sub, pin, deviceId: "" });
    saveAllLocal();
    renderAdminDashboard();
    e.target.reset();
    await syncToCloud(false);
    alert(`✅ تم إضافة حساب الأستاذ (${name})!`);
}

async function removeTeacher(idx) {
    if (!confirm("حذف حساب هذا الأستاذ؟")) return;
    localWriteEpoch++;
    teachers.splice(idx, 1);
    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
}

async function clearTeacherLogs() {
    if (!confirm("مسح سجل النشاط والتنبيهات؟")) return;
    localWriteEpoch++;
    teacherLogs = [];
    saveAllLocal();
    renderAdminDashboard();
    await syncToCloud(false);
}

async function updateAdminPin() {
    const val = document.getElementById('new-admin-pin').value.trim();
    if (!val) return alert("يرجى إدخال الرمز الجديد أولاً");
    localWriteEpoch++;
    adminPin = val;
    localStorage.setItem('g10_admin_pin', val);
    document.getElementById('new-admin-pin').value = '';
    await syncToCloud(false);
    alert("✅ تم تحديث رمز المدير العام ومزامنته بنجاح!");
}

// =========================================================================
// 14. سجل الحضور اليومي وتصدير Excel (مع استثناء الجمعة والسبت)
// =========================================================================
function setAttDateOffset(offset) {
    document.getElementById('att-date-picker').value = getTodayISO(offset);
    renderStudents();
}

function setAttToLastSchoolDay() {
    document.getElementById('att-date-picker').value = getLastSchoolDayISO();
    renderStudents();
}

function renderStudents() {
    const dateInput = document.getElementById('att-date-picker');
    if (!dateInput) return;
    if (!dateInput.value) dateInput.value = getLastSchoolDayISO();
    const selectedDate = dateInput.value;
    const isWeekend = isWeekendISO(selectedDate);

    document.getElementById('att-day-name-badge').innerText = getArabicDayNameFromISO(selectedDate) + (isWeekend ? " (عطلة)" : "");
    document.getElementById('att-weekend-banner').classList.toggle('hidden', !isWeekend);

    const tbody = document.getElementById('students-table-body');
    let presentCount = 0;
    const isAdmin = (currentRole === 'admin');

    tbody.innerHTML = students.map((rawS, i) => {
        const s = ensureStudentFields(rawS);
        const rec = s.attendance[selectedDate] || { present: false, time: "-", note: "" };
        if (rec.present) presentCount++;

        const bBadge = s.branch === "أدبي"
            ? `<span class="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded font-bold">أدبي</span>`
            : `<span class="bg-sky-100 text-sky-800 text-xs px-2 py-0.5 rounded font-bold">علمي</span>`;

        let secHtml = '';
        if (s.isLocked) {
            secHtml = `<div class="flex items-center justify-center gap-1"><span class="bg-rose-100 text-rose-800 text-[11px] px-2 py-0.5 rounded font-extrabold">⛔ مقفل (تجاوز ${MAX_DEVICE_SWITCHES})</span><button onclick="resetStudentDeviceLock(${i})" class="bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] px-2 py-0.5 rounded font-extrabold transition">🔓 فك وتصفير</button></div>`;
        } else if (s.deviceId) {
            const sw = s.deviceSwitchCount || 0;
            const swColor = sw >= 2 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800';
            secHtml = `<div class="flex items-center justify-center gap-1"><span class="${swColor} text-[11px] px-2 py-0.5 rounded font-bold">🛡️ نشط (تبديلات: ${sw}/${MAX_DEVICE_SWITCHES})</span><button onclick="resetStudentDeviceLock(${i})" class="bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] px-2 py-0.5 rounded font-bold transition">🔓 تصفير</button></div>`;
        } else {
            secHtml = `<span class="bg-slate-100 text-slate-500 text-[11px] px-2 py-0.5 rounded">⏳ مطالب بتسجيل الدخول</span>`;
        }

        return `<tr class="${rec.present ? 'bg-emerald-50/30' : ''}">
            <td class="p-3 text-slate-400 font-bold">${i + 1}</td>
            <td class="p-3 font-mono font-extrabold text-indigo-700">${s.code || 'A00'}</td>
            <td class="p-3 font-bold">${s.name}</td>
            <td class="p-3">${bBadge}</td>
            <td class="p-3 text-center whitespace-nowrap">${secHtml}</td>
            <td class="p-3 text-center"><input type="checkbox" ${rec.present ? 'checked' : ''} ${isWeekend ? 'disabled title="يوم عطلة رسمية"' : ''} onchange="toggleAttendanceForDate(${i}, '${selectedDate}')" class="w-5 h-5 accent-emerald-600 ${isWeekend ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}"></td>
            <td class="p-3 text-center text-xs font-bold text-indigo-700">${isWeekend ? 'عطلة' : (rec.time || '-')}</td>
            <td class="p-3"><input type="text" value="${escapeAttr(rec.note || '')}" ${isWeekend ? 'disabled placeholder="يوم عطلة"' : ''} onchange="updateNoteForDate(${i}, '${selectedDate}', this.value)" class="border rounded px-2 py-1 text-xs w-full ${isWeekend ? 'bg-slate-100 text-slate-400' : ''}"></td>
            <td class="p-3 text-center">${isAdmin ? `<button onclick="removeStudent(${i})" class="text-rose-500 font-bold">✖</button>` : `<span class="text-slate-300">-</span>`}</td>
        </tr>`;
    }).join('');

    document.getElementById('present-count').innerText = isWeekend ? "عطلة" : presentCount;
    document.getElementById('absent-count').innerText = isWeekend ? "عطلة" : (students.length - presentCount);
    document.getElementById('att-rate').innerText = (!isWeekend && students.length > 0) ? Math.round((presentCount / students.length) * 100) + "%" : "—";
}

async function resetStudentDeviceLock(index) {
    const st = ensureStudentFields(students[index]);
    if (!confirm(`هل تريد فك القفل وتصفير عدّاد تبديلات الجهاز للطالب (${st.name} - ${st.code})؟`)) return;
    localWriteEpoch++;
    st.deviceId = "";
    st.activeSessionId = "";
    st.deviceSwitchCount = 0;
    st.isLocked = false;

    teacherLogs.unshift({ teacher: currentTeacherName || "الإدارة", action: `🔓 فك القفل وتصفير عدّاد الأجهزة للطالب (${st.name} - ${st.code})`, time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) });
    if (teacherLogs.length > 50) teacherLogs.pop();

    if (currentStudentProfile && normalizeSecretText(currentStudentProfile.code) === normalizeSecretText(st.code)) {
        localStorage.removeItem('g10_student_profile');
        saveSessionId("");
        currentStudentProfile = null;
        updateHeaderButtons();
        updateStudentBarUI();
    }

    saveAllLocal();
    renderStudents();
    renderAdminDashboard();
    await syncToCloud(false);
    alert(`✅ تم فك القفل وتصفير عدّاد التبديلات للطالب (${st.name})!`);
}

async function toggleAttendanceForDate(i, isoDate) {
    if (isWeekendISO(isoDate)) return alert("🏖️ هذا اليوم عطلة رسمية (الجمعة أو السبت) ولا يُسجّل فيه حضور.");
    localWriteEpoch++;
    const st = ensureStudentFields(students[i]);
    const cur = st.attendance[isoDate] || { present: false, time: "-", note: "" };
    const nextPresent = !cur.present;
    st.attendance[isoDate] = {
        present: nextPresent,
        time: nextPresent ? new Date().toLocaleTimeString('ar-SY', { hour: '2-digit', minute: '2-digit' }) : "-",
        note: cur.note || ""
    };
    if (isoDate === getTodayISO(0)) {
        st.present = nextPresent;
        st.time = st.attendance[isoDate].time;
    }
    pruneStudentAttendance(st);
    saveAllLocal();
    renderStudents();
    renderAdminDashboard();
    await syncToCloud(false);
}

async function updateNoteForDate(i, isoDate, val) {
    if (isWeekendISO(isoDate)) return;
    localWriteEpoch++;
    const st = ensureStudentFields(students[i]);
    const cur = st.attendance[isoDate] || { present: false, time: "-", note: "" };
    cur.note = val;
    st.attendance[isoDate] = cur;
    if (isoDate === getTodayISO(0)) st.note = val;
    saveAllLocal();
    await syncToCloud(false);
}

async function addStudentManual() {
    if (currentRole !== 'admin') return alert("⛔ إضافة الطلاب محصورة بالمدير العام فقط!");
    const nameInput = document.getElementById('new-student-name');
    const codeInput = document.getElementById('new-student-code');
    const branchInput = document.getElementById('new-student-branch');
    const addBtn = document.getElementById('add-student-btn');

    const name = nameInput.value.trim();
    const code = normalizeSecretText(codeInput.value);
    if (!name || !code) return alert("يرجى إدخال الاسم الثلاثي والرمز!");
    if (!/^A\d+$/.test(code)) return alert("يجب أن يبدأ رمز الطالب بحرف A متبوعاً برقم (مثال: A105)");

    if (addBtn) { addBtn.disabled = true; addBtn.innerText = "⏳ جارٍ الحفظ بالسحابة..."; }
    await fetchFromCloud(false, true, true, true);

    if (students.some(s => normalizeSecretText(s.code) === code)) {
        if (addBtn) { addBtn.disabled = false; addBtn.innerText = "+ إضافة الطالب"; }
        return alert("هذا الرمز مسجل مسبقاً لطالب آخر!");
    }

    localWriteEpoch++;
    students.push({
        name, code, branch: branchInput.value,
        deviceId: "", activeSessionId: "", deviceSwitchCount: 0, isLocked: false,
        present: false, time: "-", note: "معتمد رسمياً من الإدارة", attendance: {}
    });

    saveAllLocal();
    renderStudents();
    renderAdminDashboard();
    const savedOk = await syncToCloud(false);
    if (addBtn) { addBtn.disabled = false; addBtn.innerText = "+ إضافة الطالب"; }

    if (savedOk) {
        nameInput.value = '';
        codeInput.value = '';
        alert(`✅ تم إضافة الطالب (${name} - ${code}) وتثبيته في السحابة بنجاح!`);
    } else {
        alert("⚠️ حُفظ الطالب مؤقتاً على جهازك فقط بسبب ضعف الإنترنت؛ اضغط على (⬆️ رفع البيانات يدوياً) في لوحة المدير لتثبيته في السحابة.");
    }
}

async function removeStudent(i) {
    if (currentRole !== 'admin') return alert("⛔ حذف الطلاب محصور بالمدير العام فقط!");
    if (!confirm("هل تريد حذف هذا الطالب من السجل؟")) return;
    localWriteEpoch++;
    const removed = students.splice(i, 1)[0];
    if (removed && currentStudentProfile && normalizeSecretText(currentStudentProfile.code) === normalizeSecretText(removed.code)) {
        localStorage.removeItem('g10_student_profile');
        saveSessionId("");
        currentStudentProfile = null;
        updateHeaderButtons();
        updateStudentBarUI();
    }
    saveAllLocal();
    renderStudents();
    renderAdminDashboard();
    await syncToCloud(false);
}

function downloadCSV(csvText, filename) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csvText], { type: 'text/csv;charset=utf-8;' }));
    link.download = filename;
    link.click();
}

function exportDailyAttendanceCSV() {
    const date = document.getElementById('att-date-picker').value || getLastSchoolDayISO();
    if (isWeekendISO(date)) return alert("🏖️ التاريخ المختار هو يوم عطلة رسمية (الجمعة أو السبت)! اختر يوم دوام (الأحد – الخميس) لتصدير الكشف اليومي.");
    const dayName = getArabicDayNameFromISO(date);
    let csv = "\uFEFFالرقم,رمز الطالب,الاسم الثلاثي المعتمد,الفرع,اليوم,التاريخ,الحالة,وقت الدخول,ملاحظات,عدد تبديلات الجهاز\n";
    students.forEach((rawS, i) => {
        const s = ensureStudentFields(rawS);
        const r = s.attendance[date] || { present: false, time: "-", note: "" };
        csv += `${i + 1},"${s.code || ''}","${s.name}","${s.branch || 'علمي'}","${dayName}","${date}","${r.present ? 'حاضر' : 'غائب'}","${r.time || '-'}","${(r.note || '').replace(/"/g, '""')}","${s.deviceSwitchCount || 0}/${MAX_DEVICE_SWITCHES}"\n`;
    });
    downloadCSV(csv, `سجل_حضور_العاشر_${date}.csv`);
}

function exportMonthlyAttendanceCSV() {
    const dateSet = new Set();
    students.forEach(rawS => {
        const s = ensureStudentFields(rawS);
        Object.keys(s.attendance).forEach(d => { if (!isWeekendISO(d)) dateSet.add(d); });
    });
    const today = getTodayISO(0);
    if (!isWeekendISO(today)) dateSet.add(today);

    const schoolDates = Array.from(dateSet).sort();
    if (schoolDates.length === 0) return alert("لا توجد أيام دوام مسجلة للتصدير حتى الآن.");

    let header = "\uFEFFالرقم,رمز الطالب,الاسم الثلاثي المعتمد,الفرع,";
    schoolDates.forEach(d => header += `"${d} (${getArabicDayNameFromISO(d)})",`);
    header += "مجموع أيام الحضور,مجموع أيام الغياب,نسبة الحضور %\n";

    let rows = "";
    students.forEach((rawS, i) => {
        const s = ensureStudentFields(rawS);
        let pTotal = 0, aTotal = 0;
        let line = `${i + 1},"${s.code || ''}","${s.name}","${s.branch || 'علمي'}",`;
        schoolDates.forEach(d => {
            const r = s.attendance[d];
            if (r && r.present) { pTotal++; line += `"حاضر (${r.time || '-'})",`; }
            else { aTotal++; line += `"غائب",`; }
        });
        const totalDays = pTotal + aTotal;
        line += `${pTotal},${aTotal},"${totalDays > 0 ? Math.round((pTotal / totalDays) * 100) + '%' : '0%'}"\n`;
        rows += line;
    });
    downloadCSV(header + rows, `التقرير_التراكمي_للحضور_${getLastSchoolDayISO()}.csv`);
}

// =========================================================================
// 15. سبر المعلومات المؤتمت
// =========================================================================
function renderQuizzes() {
    const container = document.getElementById('quiz-questions-container');
    if (quizzes.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-slate-400">لا توجد أسئلة سبر مضافة حالياً.</div>`;
        return;
    }
    const canDeleteQuiz = (currentRole === 'teacher' || currentRole === 'admin');
    container.innerHTML = quizzes.map((q, qIdx) => {
        const opts = q.options.map((o, oIdx) => `<label id="q${qIdx}-opt${oIdx}-label" class="flex items-center gap-2 p-2.5 rounded-lg border bg-white hover:bg-indigo-50 cursor-pointer text-sm transition"><input type="radio" name="quiz-q-${qIdx}" value="${oIdx}" class="accent-indigo-600"> <span>${o}</span></label>`).join('');
        const delBtn = canDeleteQuiz ? `<button onclick="deleteQuizQuestion(${qIdx})" class="bg-rose-100 hover:bg-rose-200 text-rose-700 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition">🗑️ حذف السؤال</button>` : '';
        return `<div class="p-4 rounded-xl bg-slate-50 border space-y-3"><div class="flex justify-between items-center"><span class="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-0.5 rounded-full">${q.subject}</span>${delBtn}</div><h4 class="font-bold text-slate-800">${qIdx + 1}. ${q.q}</h4><div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${opts}</div></div>`;
    }).join('');
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
}

async function addQuizQuestion(e) {
    e.preventDefault();
    localWriteEpoch++;
    const sub = document.getElementById('quiz-sub').value;
    quizzes.push({
        subject: sub,
        q: document.getElementById('quiz-q').value,
        options: [
            document.getElementById('quiz-opt0').value,
            document.getElementById('quiz-opt1').value,
            document.getElementById('quiz-opt2').value,
            document.getElementById('quiz-opt3').value
        ],
        correct: parseInt(document.getElementById('quiz-correct').value, 10)
    });
    teacherLogs.unshift({ teacher: currentTeacherName || "الأستاذ", action: `إضافة سؤال سبر (${sub})`, time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) });
    if (teacherLogs.length > 50) teacherLogs.pop();
    saveAllLocal();
    e.target.reset();
    renderQuizzes();
    renderAdminDashboard();
    await syncToCloud(false);
    alert('✅ تم إضافة السؤال ومزامنته مع الطلاب!');
}

async function deleteQuizQuestion(qIdx) {
    if (!confirm("هل تريد حذف هذا السؤال من سبر المعلومات؟")) return;
    localWriteEpoch++;
    const removed = quizzes.splice(qIdx, 1)[0];
    teacherLogs.unshift({ teacher: currentTeacherName || "الأستاذ", action: `حذف سؤال سبر (${removed ? removed.subject : ''})`, time: new Date().toLocaleString('ar-SY', { dateStyle: 'short', timeStyle: 'short' }) });
    if (teacherLogs.length > 50) teacherLogs.pop();
    saveAllLocal();
    renderQuizzes();
    renderAdminDashboard();
    await syncToCloud(false);
}

function submitQuiz() {
    let score = 0;
    quizzes.forEach((q, qIdx) => {
        const sel = document.querySelector(`input[name="quiz-q-${qIdx}"]:checked`);
        q.options.forEach((_, oIdx) => {
            const lbl = document.getElementById(`q${qIdx}-opt${oIdx}-label`);
            if (lbl) {
                lbl.classList.remove('bg-emerald-100', 'border-emerald-500', 'bg-rose-100', 'border-rose-500');
                if (oIdx === q.correct) lbl.classList.add('bg-emerald-100', 'border-emerald-500', 'font-bold');
            }
        });
        if (sel) {
            const ans = parseInt(sel.value, 10);
            if (ans === q.correct) score++;
            else {
                const wrongLbl = document.getElementById(`q${qIdx}-opt${ans}-label`);
                if (wrongLbl) wrongLbl.classList.add('bg-rose-100', 'border-rose-500');
            }
        }
    });
    const badge = document.getElementById('quiz-score-badge');
    badge.classList.remove('hidden');
    badge.innerText = `النتيجة: ${score} / ${quizzes.length}`;
}

function resetQuiz() {
    document.getElementById('quiz-score-badge').classList.add('hidden');
    renderQuizzes();
}
