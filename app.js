const firebaseConfig = {
    apiKey: "AIzaSyCkzQP5GIabzQTUo9d9q98Ih0y1gDqFi7A",
    authDomain: "tribleone-30cb8.firebaseapp.com",
    projectId: "tribleone-30cb8",
    storageBucket: "tribleone-30cb8.firebasestorage.app",
    messagingSenderId: "880025708456",
    appId: "1:880025708456:web:abebfc77ed6651279d9f9d",
    measurementId: "G-TM9GBGVDL"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let activeAccountId = localStorage.getItem('last_active_acc_id') || null;
let accountsMap = {}; 
let unsubscribeFirestore = null;
let currentSelectedTurnNo = null;

// PREMIUM UI HELPERS: TOAST + CONFIRM MODAL
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const styles = {
        success: { icon: 'fa-circle-check', color: 'text-emerald-400', border: 'border-emerald-500/40' },
        error:   { icon: 'fa-circle-exclamation', color: 'text-rose-400', border: 'border-rose-500/40' },
        info:    { icon: 'fa-circle-info', color: 'text-amber-400', border: 'border-amber-500/40' }
    };
    const s = styles[type] || styles.info;
    const toast = document.createElement('div');
    toast.className = `toast-in glass-panel ${s.border} rounded-2xl px-4 py-3 shadow-2xl flex items-start gap-2.5`;
    toast.innerHTML = `
        <i class="fa-solid ${s.icon} ${s.color} text-sm mt-0.5"></i>
        <span class="text-xs font-bold text-slate-100 leading-snug">${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('toast-in');
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 220);
    }, 3200);
}

let confirmModalResolver = null;
function showConfirm(message, okLabel = 'အတည်ပြုမည်') {
    document.getElementById('confirm-modal-text').textContent = message;
    document.getElementById('confirm-modal-ok').textContent = okLabel;
    document.getElementById('confirm-modal').classList.replace('hidden', 'flex');
    return new Promise(resolve => { confirmModalResolver = resolve; });
}
function closeConfirmModal(result) {
    document.getElementById('confirm-modal').classList.replace('flex', 'hidden');
    if (confirmModalResolver) { confirmModalResolver(result); confirmModalResolver = null; }
}

// AUTH LISTENERS
let splashResolved = false;
function hideSplash() {
    if (splashResolved) return;
    splashResolved = true;
    document.getElementById('splash-view').classList.add('splash-hidden');
}

setTimeout(() => {
    if (splashResolved) return;
    hideSplash();
    if (location.protocol === 'file:') {
        showToast('ဒီ App ကို file:// ဖြင့် ဖွင့်၍ ရပါမည် မဟုတ်ပါ။ Local server (သို့) Hosting တစ်ခုခုမှတဆင့် ဖွင့်ပါ။', 'error');
    } else {
        showToast('Server နှင့် ချိတ်ဆက်ရန် အချိန်ကြာနေပါသည်။ Internet ချိတ်ဆက်မှု စစ်ဆေးပါ။', 'error');
    }
}, 4000);

auth.onAuthStateChanged(user => {
    hideSplash();
    if (user) {
        currentUser = user;
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('app-view').classList.remove('hidden');
        document.getElementById('user-photo').src = user.photoURL || 'https://via.placeholder.com/150';

        db.collection("users").doc(user.uid).set({
            uid: user.uid,
            name: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        initApp();
    } else {
        currentUser = null;
        document.getElementById('login-view').classList.remove('hidden');
        document.getElementById('app-view').classList.add('hidden');
    }
});

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => showToast("Login Error: " + err.message, 'error'));
}

function logout() { auth.signOut(); }

function initApp() {
    document.getElementById('new-acc-startdate').valueAsDate = new Date();
    loadSavedAccountsFromStorage();

    if (activeAccountId) {
        connectToAccount(activeAccountId);
    } else {
        renderApp();
    }
}

function loadSavedAccountsFromStorage() {
    const saved = localStorage.getItem('multi_rosca_app_clean_v2');
    if (saved) {
        try { accountsMap = JSON.parse(saved); } catch(e){}
    }
}

function saveAccountsToStorage() {
    localStorage.setItem('multi_rosca_app_clean_v2', JSON.stringify(accountsMap));
    if (activeAccountId) {
        localStorage.setItem('last_active_acc_id', activeAccountId);
    }
}

// REALTIME CLOUD SYNC BY ACCOUNT ID
function connectToAccount(accId) {
    if (!accId) return;
    activeAccountId = accId.trim();
    localStorage.setItem('last_active_acc_id', activeAccountId);

    if (unsubscribeFirestore) unsubscribeFirestore();

    unsubscribeFirestore = db.collection("rosca_accounts").doc(activeAccountId)
        .onSnapshot(doc => {
            if (doc.exists) {
                accountsMap[activeAccountId] = doc.data();
                saveAccountsToStorage();
                renderApp();
            } else if (!accountsMap[activeAccountId]) {
                showToast("Account ID ရှာမတွေ့ပါ သို့မဟုတ် ဖျက်လိုက်ပါပြီ။", 'error');
                activeAccountId = Object.keys(accountsMap)[0] || null;
                localStorage.setItem('last_active_acc_id', activeAccountId || '');
                renderApp();
            }
        }, err => {
            console.log("Sync Error:", err);
            renderApp();
        });
}

function saveCurrentState() {
    const acc = getActiveAccount();
    if (!acc) return;
    recalculateTurns(acc);

    accountsMap[acc.id] = acc;
    saveAccountsToStorage();

    db.collection("rosca_accounts").doc(acc.id).set(acc);
    renderApp();
}

function getActiveAccount() {
    return activeAccountId ? accountsMap[activeAccountId] : null;
}

// OWNERSHIP
function isAccountOwner(acc) {
    if (!acc) return false;
    if (!acc.createdBy) return true;
    return !!currentUser && currentUser.uid === acc.createdBy;
}
function requireOwner(acc) {
    if (isAccountOwner(acc)) return true;
    showToast('ဤအကောင့်ကို ဖန်တီးခဲ့သည့် Google Account ဖြင့် login ဝင်မှသာ ပြင်ဆင်နိုင်ပါသည်။', 'error');
    return false;
}

function recalculateTurns(acc) {
    let existingTurnsMap = {};
    if (acc.turns) {
        acc.turns.forEach(t => { existingTurnsMap[t.turnNo] = t; });
    }

    let newTurns = [];
    let slots = [];
    acc.members.forEach(m => {
        const count = parseInt(m.shares) || 1;
        for (let s = 1; s <= count; s++) {
            slots.push({ memberId: m.id, memberName: m.name, shareIndex: s });
        }
    });

    slots.forEach((slot, index) => {
        const currentTurnNo = index + 1;
        let date = new Date(acc.startDate);
        date.setDate(date.getDate() + (currentTurnNo * parseInt(acc.interval)));

        const prevTurn = existingTurnsMap[currentTurnNo];
        const assignedMemberId = prevTurn ? prevTurn.memberId : slot.memberId;
        const assignedMember = acc.members.find(m => m.id === assignedMemberId) || slot;

        newTurns.push({
            turnNo: currentTurnNo,
            memberId: assignedMember.id || assignedMember.memberId,
            memberName: assignedMember.name || assignedMember.memberName,
            shareIndex: prevTurn ? prevTurn.shareIndex : slot.shareIndex,
            payoutDate: date.toISOString().split('T')[0],
            taken: prevTurn ? prevTurn.taken : false,
            payments: prevTurn && prevTurn.payments ? prevTurn.payments : {}
        });
    });

    acc.turns = newTurns;
}

function renderApp() {
    renderAccountSelector();
    const acc = getActiveAccount();

    const emptyView = document.getElementById('view-empty');
    const mainContent = document.getElementById('main-app-content');
    const ownerBadge = document.getElementById('owner-badge');

    if (!acc) {
        emptyView.classList.remove('hidden');
        mainContent.classList.add('hidden');
        document.getElementById('disp-acc-id').textContent = `ID: -`;
        ownerBadge.classList.add('hidden');
        return;
    }

    emptyView.classList.add('hidden');
    mainContent.classList.remove('hidden');

    document.getElementById('disp-acc-id').textContent = `ID: ${acc.id}`;
    document.getElementById('disp-acc-name').textContent = acc.name;
    document.getElementById('disp-amount').textContent = parseInt(acc.amount).toLocaleString();
    document.getElementById('disp-interval').textContent = acc.interval;
    document.getElementById('disp-start-date').textContent = acc.startDate;

    const owner = isAccountOwner(acc);
    document.getElementById('btn-shuffle').classList.toggle('hidden', !owner);
    document.getElementById('btn-add-member').classList.toggle('hidden', !owner);
    ownerBadge.classList.remove('hidden');
    if (owner) {
        ownerBadge.textContent = '✓ Owner';
        ownerBadge.className = 'text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    } else {
        ownerBadge.textContent = '👁 View Only';
        ownerBadge.className = 'text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-700/40 text-slate-400 border border-slate-600/40';
    }

    renderActiveTurnHeroBanner(acc);
    renderDashboardOverviewCards(acc);
    renderDashboardCardsGrid();
    renderMembersTable();
    renderAuditSelect();
}

function renderActiveTurnHeroBanner(acc) {
    if (!acc || !acc.turns || acc.turns.length === 0) {
        document.getElementById('active-turn-banner').classList.add('hidden');
        return;
    }
    document.getElementById('active-turn-banner').classList.remove('hidden');

    const totalShares = acc.members.reduce((sum, m) => sum + (parseInt(m.shares) || 0), 0);
    const payoutAmount = totalShares * (parseInt(acc.amount) * parseInt(acc.interval));

    const activeTurnIndex = acc.turns.findIndex(t => !t.taken);
    let activeTurn = activeTurnIndex !== -1 ? acc.turns[activeTurnIndex] : acc.turns[acc.turns.length - 1];
    let nextTurn = (activeTurnIndex !== -1 && activeTurnIndex + 1 < acc.turns.length) ? acc.turns[activeTurnIndex + 1] : null;

    document.getElementById('hero-turn-no').textContent = `လက်ရှိ မဲအလှည့် #${activeTurn.turnNo}`;
    document.getElementById('hero-member-name').textContent = `${activeTurn.memberName} (အစု #${activeTurn.shareIndex})`;
    document.getElementById('hero-payout-amount').textContent = `${payoutAmount.toLocaleString()} ကျပ်`;
    document.getElementById('hero-payout-date').textContent = activeTurn.payoutDate;

    const daysLeft = getDaysDifference(activeTurn.payoutDate);
    const daysLeftBadge = document.getElementById('hero-days-left');
    if (activeTurn.taken) {
        daysLeftBadge.textContent = "✅ ထုတ်ယူပြီးပါပြီ";
        daysLeftBadge.className = "bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs px-3 py-1 rounded-full font-bold";
    } else if (daysLeft < 0) {
        daysLeftBadge.textContent = `⚠️ ${Math.abs(daysLeft)} ရက် ကျော်လွန်နေပါပြီ`;
        daysLeftBadge.className = "bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs px-3 py-1 rounded-full font-bold";
    } else if (daysLeft === 0) {
        daysLeftBadge.textContent = "🎉 ဒီနေ့ မဲထုတ်ယူရမည့်ရက်";
        daysLeftBadge.className = "bg-amber-400 text-slate-950 font-black text-xs px-3 py-1 rounded-full";
    } else {
        daysLeftBadge.textContent = `⏳ ထုတ်ယူရန် ${daysLeft} ရက် လိုသေးသည်`;
        daysLeftBadge.className = "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-3 py-1 rounded-full font-bold";
    }

    if (nextTurn) {
        document.getElementById('hero-next-name').textContent = `#${nextTurn.turnNo} - ${nextTurn.memberName}`;
        document.getElementById('hero-next-date').textContent = nextTurn.payoutDate;
    } else {
        document.getElementById('hero-next-name').textContent = "နောက်ထပ် မဲအလှည့် မရှိတော့ပါ";
        document.getElementById('hero-next-date').textContent = "-";
    }
}

function getDaysDifference(targetDateStr) {
    const target = new Date(targetDateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    target.setHours(0,0,0,0);
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function renderDashboardOverviewCards(acc) {
    const titleEl = document.getElementById('summary-card-title');
    const chipEl = document.getElementById('summary-card-status-chip');

    if (!acc || !acc.turns || acc.turns.length === 0) {
        titleEl.textContent = 'လက်ရှိအလှည့် အခြေအနေ';
        chipEl.textContent = 'အလှည့် မရှိသေးပါ';
        chipEl.className = 'text-[10px] font-bold px-2.5 py-1 rounded-full border border-slate-700 bg-slate-800/60 text-slate-400';
        document.getElementById('summary-collected').textContent = '0 ကျပ်';
        document.getElementById('summary-pending').textContent = '0 ကျပ်';
        document.getElementById('summary-paid-count').textContent = '0 / 0 ဦး';
        document.getElementById('summary-total-members').textContent = '0 ဦး';
        document.getElementById('summary-progress-bar').style.width = '0%';
        return;
    }

    const activeTurnIndex = acc.turns.findIndex(t => !t.taken);
    const activeTurn = activeTurnIndex !== -1 ? acc.turns[activeTurnIndex] : acc.turns[acc.turns.length - 1];

    const summary = getTurnPaymentSummary(activeTurn);
    const percentPaid = summary.totalCount > 0 ? Math.round((summary.paidCount / summary.totalCount) * 100) : 0;

    titleEl.textContent = `လက်ရှိအလှည့် (#${activeTurn.turnNo}) အခြေအနေ`;

    if (activeTurn.taken) {
        chipEl.textContent = '✅ ထုတ်ယူပြီး';
        chipEl.className = 'text-[10px] font-bold px-2.5 py-1 rounded-full border border-purple-500/30 bg-purple-500/15 text-purple-300';
    } else if (summary.paidCount >= summary.totalCount && summary.totalCount > 0) {
        chipEl.textContent = '💰 ကောက်ခံပြီးစီး';
        chipEl.className = 'text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
    } else {
        chipEl.textContent = '⏳ ကောက်ခံနေဆဲ';
        chipEl.className = 'text-[10px] font-bold px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-300';
    }

    document.getElementById('summary-collected').textContent = `${summary.paidAmount.toLocaleString()} ကျပ်`;
    document.getElementById('summary-pending').textContent = `${summary.pendingAmount.toLocaleString()} ကျပ်`;
    document.getElementById('summary-paid-count').textContent = `${summary.paidCount} / ${summary.totalCount} ဦး`;
    document.getElementById('summary-total-members').textContent = `${summary.totalCount} ဦး`;
    document.getElementById('summary-progress-bar').style.width = `${percentPaid}%`;
}

function renderAccountSelector() {
    const select = document.getElementById('account-select');
    select.innerHTML = '';
    const keys = Object.keys(accountsMap);
    if (keys.length === 0) {
        select.innerHTML = `<option value="">-- အကောင့်မရှိသေးပါ --</option>`;
        return;
    }
    keys.forEach(id => {
        const acc = accountsMap[id];
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = `${acc.name}`;
        if (acc.id === activeAccountId) opt.selected = true;
        select.appendChild(opt);
    });
}

function switchAccount(accId) {
    if (accId) connectToAccount(accId);
}

function getTurnPaymentSummary(turn) {
    const acc = getActiveAccount();
    if (!acc || !turn) return { paidCount: 0, totalCount: 0, paidAmount: 0, pendingAmount: 0, perShareTurnAmount: 0 };

    const totalShares = acc.members.reduce((sum, m) => sum + (parseInt(m.shares) || 0), 0);
    const perShareTurnAmount = parseInt(acc.amount) * parseInt(acc.interval);
    let paidCount = 0;

    if (!turn.payments) turn.payments = {};
    acc.members.forEach(m => {
        const count = parseInt(m.shares) || 1;
        for (let s = 1; s <= count; s++) {
            if (turn.payments[`${m.id}_${s}`]) paidCount++;
        }
    });

    return {
        paidCount,
        totalCount: totalShares,
        paidAmount: paidCount * perShareTurnAmount,
        pendingAmount: (totalShares - paidCount) * perShareTurnAmount,
        perShareTurnAmount
    };
}

function renderDashboardCardsGrid() {
    const acc = getActiveAccount();
    if (!acc) return;

    const gridContainer = document.getElementById('dashboard-cards-grid');
    gridContainer.innerHTML = '';

    const searchValue = document.getElementById('search-input').value.toLowerCase();
    const filterValue = document.getElementById('status-filter').value;

    if (!acc.turns || acc.turns.length === 0) {
        gridContainer.innerHTML = `<div class="col-span-full glass-panel p-8 rounded-2xl text-center text-xs text-slate-500">မဲအလှည့် မရှိသေးပါ။ အဖွဲ့ဝင်များ စတင်ထည့်သွင်းပေးပါ။</div>`;
        return;
    }

    acc.turns.forEach(t => {
        const matchesSearch = t.memberName.toLowerCase().includes(searchValue);
        let matchesFilter = true;
        if (filterValue === 'pending') matchesFilter = !t.taken;
        if (filterValue === 'taken') matchesFilter = t.taken;

        if (matchesSearch && matchesFilter) {
            const paySummary = getTurnPaymentSummary(t);
            const isAllPaid = paySummary.paidCount === paySummary.totalCount;
            const percentPaid = Math.round((paySummary.paidCount / (paySummary.totalCount || 1)) * 100);
            const daysLeft = getDaysDifference(t.payoutDate);

            const card = document.createElement('div');
            card.onclick = () => openPaymentModal(t.turnNo);
            card.className = `glass-panel p-4 rounded-xl shadow-lg card-hover cursor-pointer hover:border-indigo-500/50 relative overflow-hidden ${
                t.taken ? 'border-purple-500/40' : (isAllPaid ? 'border-emerald-500/50' : 'border-amber-500/30')
            }`;

            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="brand-chip text-xs font-bold px-2.5 py-1 rounded-full">
                        မဲအလှည့် #${t.turnNo}
                    </span>
                    <button onclick="togglePayoutDirectly(event, ${t.turnNo})" class="text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${
                        t.taken 
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' 
                        : 'bg-slate-950 text-amber-400 border-amber-500/30 hover:bg-slate-800'
                    }">
                        ${t.taken ? '✅ ထုတ်ပြီး' : '⏳ မထုတ်ရသေး'}
                    </button>
                </div>

                <div class="mb-3">
                    <div class="text-[10px] text-slate-400 font-bold uppercase">မဲပေါက်သူ / ထုတ်ယူမည့်သူ</div>
                    <div class="text-lg font-bold text-white">${t.memberName} <span class="text-xs text-indigo-300/80">(အစု #${t.shareIndex})</span></div>
                    <div class="text-xs text-slate-300 font-bold flex justify-between items-center mt-1 num">
                        <span><i class="fa-solid fa-calendar-day mr-1 text-indigo-400"></i> ${t.payoutDate}</span>
                        <span class="text-[10px] text-slate-500 font-normal">(${daysLeft > 0 ? daysLeft + ' ရက်လို' : (daysLeft === 0 ? 'ဒီနေ့' : Math.abs(daysLeft) + ' ရက်လွန်')})</span>
                    </div>
                </div>

                <div class="space-y-1">
                    <div class="flex justify-between text-[11px] font-bold">
                        <span class="text-slate-400">မဲကြေးကောက်ခံမှု:</span>
                        <span class="${isAllPaid ? 'text-emerald-400' : 'text-amber-400'} num">${paySummary.paidCount} / ${paySummary.totalCount} စာ (${percentPaid}%)</span>
     </div>
                    <div class="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                        <div class="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-300" style="width: ${percentPaid}%"></div>
                    </div>
                </div>

                <div class="mt-3 pt-2.5 border-t border-slate-800 flex justify-between items-center text-[11px] text-indigo-300 font-bold">
                    <span>အသေးစိတ် / မဲအလှည့်ပြင်ရန် နှိပ်ပါ</span>
                    <i class="fa-solid fa-circle-arrow-right"></i>
                </div>
            `;
            gridContainer.appendChild(card);
        }
    });
}

function togglePayoutDirectly(event, turnNo) {
    event.stopPropagation();
    const acc = getActiveAccount();
    if (!requireOwner(acc)) return;
    const turn = acc.turns.find(t => t.turnNo === turnNo);
    if (!turn) return;

    turn.taken = !turn.taken;
    saveCurrentState();
}

function openPaymentModal(turnNo) {
    currentSelectedTurnNo = turnNo;
    const acc = getActiveAccount();
    const turn = acc.turns.find(t => t.turnNo === turnNo);
    if (!turn) return;

    document.getElementById('modal-turn-badge').textContent = `မဲအလှည့် #${turn.turnNo}`;
    document.getElementById('pay-modal-title').textContent = `${turn.memberName} ၏ မဲအလှည့်`;
    document.getElementById('pay-modal-subtitle').textContent = `မဲထုတ်ရမည့်ရက်: ${turn.payoutDate}`;

    renderPaymentModalContent();
    document.getElementById('payment-modal').classList.replace('hidden', 'flex');
}

function renderPaymentModalContent() {
    const acc = getActiveAccount();
    const turn = acc.turns.find(t => t.turnNo === currentSelectedTurnNo);
    if (!turn) return;

    const owner = isAccountOwner(acc);
    document.getElementById('btn-manual-assign').classList.toggle('hidden', !owner);
    document.getElementById('btn-mark-all-paid').classList.toggle('hidden', !owner);
    document.getElementById('modal-payout-btn').classList.toggle('opacity-50', !owner);
    document.getElementById('modal-payout-btn').classList.toggle('cursor-not-allowed', !owner);

    const summary = getTurnPaymentSummary(turn);
    const totalPayoutAmount = summary.totalCount * summary.perShareTurnAmount;

    document.getElementById('modal-payout-amt').textContent = `${totalPayoutAmount.toLocaleString()} ကျပ်`;
    document.getElementById('modal-payout-status').textContent = turn.taken ? '✅ ထုတ်ယူပြီးပါပြီ' : '⏳ မထုတ်ယူရသေးပါ';

    document.getElementById('modal-paid-amt').textContent = `${summary.paidAmount.toLocaleString()} ကျပ်`;
    document.getElementById('modal-paid-count').textContent = `(${summary.paidCount} / ${summary.totalCount} စာ ပေးပြီး)`;

    document.getElementById('modal-pending-amt').textContent = `${summary.pendingAmount.toLocaleString()} ကျပ်`;
    document.getElementById('modal-pending-count').textContent = `(${summary.totalCount - summary.paidCount} / ${summary.totalCount} စာ ကျန်)`;

    const payoutBtn = document.getElementById('modal-payout-btn');
    if (turn.taken) {
        payoutBtn.className = "text-xs px-3.5 py-1.5 rounded-xl font-bold shadow bg-purple-500/20 text-purple-300 border border-purple-500/40";
        payoutBtn.textContent = "✅ ငွေထုတ်ယူပြီးဖြစ်သည် (မထုတ်ရသေးဟု ပြောင်းရန်)";
    } else {
        payoutBtn.className = "text-xs px-3.5 py-1.5 rounded-xl font-black shadow bg-amber-500 hover:bg-amber-400 text-slate-950";
        payoutBtn.textContent = "⏳ ထုတ်ယူပြီးကြောင်း မှတ်သားမည်";
    }

    const unpaidList = document.getElementById('payment-list-unpaid');
    const paidList = document.getElementById('payment-list-paid');
    unpaidList.innerHTML = '';
    paidList.innerHTML = '';

    let unpaidCount = 0;
    let paidCount = 0;

    acc.members.forEach(m => {
        const sharesCount = parseInt(m.shares) || 1;
        for (let s = 1; s <= sharesCount; s++) {
            const key = `${m.id}_${s}`;
            const isPaid = turn.payments && turn.payments[key];

            const item = document.createElement('div');
            item.className = 'flex justify-between items-center p-2.5 text-xs bg-slate-900 rounded-xl border border-slate-800';
            item.innerHTML = `
                <div>
                    <span class="font-bold text-slate-200">${m.name}</span>
                    <span class="text-[10px] text-amber-400 ml-1">(အစု #${s})</span>
                    <div class="text-[10px] text-slate-400">${summary.perShareTurnAmount.toLocaleString()} ကျပ်</div>
                </div>
                <button onclick="toggleMemberPayment('${key}')" class="px-3 py-1 rounded-lg text-[10px] font-bold ${
                    isPaid 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }">
                    ${isPaid ? '✓ ပေးပြီး' : '⚠️ ပေးရန်ကျန်'}
                </button>
            `;

            if (isPaid) {
                paidList.appendChild(item);
                paidCount++;
            } else {
                unpaidList.appendChild(item);
                unpaidCount++;
            }
        }
    });

    document.getElementById('badge-unpaid-count').textContent = unpaidCount;
    document.getElementById('badge-paid-count').textContent = paidCount;

    if (unpaidCount === 0) unpaidList.innerHTML = '<p class="text-[11px] text-emerald-400 text-center py-4 font-bold">🎉 အားလုံး မဲကြေး ပေးပြီးပါပြီ</p>';
    if (paidCount === 0) paidList.innerHTML = '<p class="text-[11px] text-slate-500 text-center py-4">မဲကြေးပေးပြီးသူ မရှိသေးပါ</p>';
}

function openManualAssignModal() {
    const acc = getActiveAccount();
    if (!requireOwner(acc)) return;
    const turn = acc.turns.find(t => t.turnNo === currentSelectedTurnNo);
    if (!turn) return;

    document.getElementById('assign-modal-turn-title').textContent = `မဲအလှည့် #${turn.turnNo} (လက်ရှိ: ${turn.memberName})`;
    const select = document.getElementById('assign-member-select');
    select.innerHTML = '';

    acc.members.forEach(m => {
        const shares = parseInt(m.shares) || 1;
        for (let s = 1; s <= shares; s++) {
            const opt = document.createElement('option');
            opt.value = `${m.id}_${s}`;
            opt.textContent = `${m.name} (အစု #${s})`;
            if (m.id === turn.memberId && s === turn.shareIndex) opt.selected = true;
            select.appendChild(opt);
        }
    });

    document.getElementById('manual-assign-modal').classList.replace('hidden', 'flex');
}

function closeManualAssignModal() {
    document.getElementById('manual-assign-modal').classList.replace('flex', 'hidden');
}

function submitManualAssignTurn() {
    const acc = getActiveAccount();
    if (!requireOwner(acc)) return;
    const turn = acc.turns.find(t => t.turnNo === currentSelectedTurnNo);
    if (!turn) return;

    const selectedValue = document.getElementById('assign-member-select').value;
    const [mId, sIndex] = selectedValue.split('_');
    const member = acc.members.find(m => m.id == mId);

    if (member) {
        turn.memberId = member.id;
        turn.memberName = member.name;
        turn.shareIndex = parseInt(sIndex);

        saveCurrentState();
        closeManualAssignModal();
        openPaymentModal(turn.turnNo);
    }
}

function togglePayoutFromModal() {
    const acc = getActiveAccount();
    if (!requireOwner(acc)) return;
    const turn = acc.turns.find(t => t.turnNo === currentSelectedTurnNo);
    if (!turn) return;

    turn.taken = !turn.taken;
    saveCurrentState();
    renderPaymentModalContent();
}

function toggleMemberPayment(shareKey) {
    const acc = getActiveAccount();
    if (!requireOwner(acc)) return;
    const turn = acc.turns.find(t => t.turnNo === currentSelectedTurnNo);
    if (!turn) return;

    if (!turn.payments) turn.payments = {};
    turn.payments[shareKey] = !turn.payments[shareKey];
    saveCurrentState();
    renderPaymentModalContent();
}

function markAllPaidForCurrentTurn() {
    const acc = getActiveAccount();
    if (!requireOwner(acc)) return;
    const turn = acc.turns.find(t => t.turnNo === currentSelectedTurnNo);
    if (!turn) return;

    showConfirm(`မဲအလှည့် #${turn.turnNo} အတွက် အဖွဲ့ဝင် အစုအားလုံးကို [ မဲကြေးပေးပြီး ] ဟု မှတ်သားရန် သေချာပါသလား။`).then(ok => {
        if (!ok) return;
        if (!turn.payments) turn.payments = {};
        acc.members.forEach(m => {
            const count = parseInt(m.shares) || 1;
            for (let s = 1; s <= count; s++) turn.payments[`${m.id}_${s}`] = true;
        });
        saveCurrentState();
        renderPaymentModalContent();
        showToast('အားလုံး ပေးပြီးဟု မှတ်သားပြီးပါပြီ', 'success');
    });
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.replace('flex', 'hidden');
    currentSelectedTurnNo = null;
}

function renderMembersTable() {
    const acc = getActiveAccount();
    if (!acc) return;
    const owner = isAccountOwner(acc);

    const tbody = document.getElementById('members-table-body');
    tbody.innerHTML = '';

    if (acc.members.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-xs text-slate-500">အဖွဲ့ဝင် စာရင်း မရှိသေးပါ။ "အဖွဲ့ဝင်အသစ် ထည့်ရန်" ကို နှိပ်ပါ။</td></tr>`;
        return;
    }

    acc.members.forEach(m => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-900/40 transition';
        tr.innerHTML = `
            <td class="p-3 font-bold text-white">${m.name}</td>
            <td class="p-3 text-xs text-slate-400 num">${m.phone || '-'}</td>
            <td class="p-3 text-center font-bold text-indigo-300 num">${m.shares} စာ</td>
            <td class="p-3 text-center space-x-2">
                ${owner ? `
                <button onclick="openMemberModal(${m.id})" class="text-indigo-300 hover:text-indigo-200 text-xs font-bold">
                    <i class="fa-solid fa-pen-to-square"></i> ပြင်မည်
                </button>
                <button onclick="deleteMember(${m.id})" class="text-rose-400 hover:text-rose-300 text-xs font-bold">
                    <i class="fa-solid fa-trash"></i> ဖျက်မည်
                </button>` : `<span class="text-[11px] text-slate-600">-</span>`}
            </td>
        `;
        tbody.appendChild(tr);
    });
        }
function saveMember() {
    const acc = getActiveAccount();
    if (!acc) { showToast('အကောင့် ပထမဦးစွာ ဖွင့်ပါ', 'error'); return; }
    if (!requireOwner(acc)) return;

    const id = document.getElementById('member-id').value;
    const name = document.getElementById('member-name').value.trim();
    const phone = document.getElementById('member-phone').value.trim();
    const shares = parseInt(document.getElementById('member-shares').value) || 1;

    if (!name) { showToast('အမည် ထည့်ပါ', 'error'); return; }

    if (id) {
        const m = acc.members.find(x => x.id == id);
        if (m) { m.name = name; m.phone = phone; m.shares = shares; }
    } else {
        acc.members.push({ id: Date.now(), name, phone, shares });
    }

    closeMemberModal();
    saveCurrentState();
    showToast(`${name} ကို သိမ်းဆည်းပြီးပါပြီ`, 'success');
}

function deleteMember(id) {
    const acc = getActiveAccount();
    if (!acc) return;
    if (!requireOwner(acc)) return;
    const m = acc.members.find(x => x.id == id);
    if (!m) return;
    showConfirm(`အဖွဲ့ဝင် "${m.name}" ကို ဖျက်ပစ်ရန် သေချာပါသလား။`, 'ဖျက်မည်').then(ok => {
        if (!ok) return;
        acc.members = acc.members.filter(x => x.id != id);
        saveCurrentState();
        showToast(`${m.name} ကို ဖျက်ပြီးပါပြီ`, 'success');
    });
}

function shuffleTurns() {
    const acc = getActiveAccount();
    if (!acc || acc.turns.length === 0) return;
    if (!requireOwner(acc)) return;

    showConfirm('မထုတ်ယူရသေးသော မဲအလှည့်များကိုသာ မဲနှိုက် စီပေးမည် ဖြစ်ပါသည်။ သေချာပါသလား။', 'မဲနှိုက်မည်').then(ok => {
        if (!ok) return;
        let untakenTurns = acc.turns.filter(t => !t.taken);

        let slotPool = untakenTurns.map(t => ({
            memberId: t.memberId,
            memberName: t.memberName,
            shareIndex: t.shareIndex
        }));

        for (let i = slotPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [slotPool[i], slotPool[j]] = [slotPool[j], slotPool[i]];
        }

        let poolIdx = 0;
        acc.turns.forEach(t => {
            if (!t.taken) {
                t.memberId = slotPool[poolIdx].memberId;
                t.memberName = slotPool[poolIdx].memberName;
                t.shareIndex = slotPool[poolIdx].shareIndex;
                poolIdx++;
            }
        });

        saveCurrentState();
        showToast('မဲအလှည့်များ အသစ် နှိုက်ပြီးပါပြီ', 'success');
    });
}

function renderAuditSelect() {
    const acc = getActiveAccount();
    if (!acc) return;

    const select = document.getElementById('audit-member-select');
    select.innerHTML = '';
    acc.members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} (${m.shares} စာဝယ်ထားသူ)`;
        select.appendChild(opt);
    });
    renderMemberAuditDetails();
}

function renderMemberAuditDetails() {
    const acc = getActiveAccount();
    if (!acc) return;

    const select = document.getElementById('audit-member-select');
    const box = document.getElementById('audit-details-box');
    
    const memberId = parseInt(select.value);
    const member = acc.members.find(m => m.id === memberId);

    if (!member) {
        box.innerHTML = '<p class="text-xs text-slate-500">အဖွဲ့ဝင် မရှိသေးပါ</p>';
        return;
    }

    const memberTurns = acc.turns.filter(t => t.memberId === memberId);

    let slotsHtml = '';
    memberTurns.forEach((t) => {
        const daysLeft = getDaysDifference(t.payoutDate);
        let statusBadge = '';

        if (t.taken) {
            statusBadge = `<span class="bg-purple-500/20 text-purple-300 text-xs px-2.5 py-1 rounded-full font-bold">✅ ထုတ်ယူပြီး</span>`;
        } else if (daysLeft < 0) {
            statusBadge = `<span class="bg-rose-500/20 text-rose-300 text-xs px-2.5 py-1 rounded-full font-bold">⚠️ ${Math.abs(daysLeft)} ရက်ကျော်လွန်</span>`;
        } else if (daysLeft === 0) {
            statusBadge = `<span class="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-1 rounded-full font-bold">🎉 ဒီနေ့ မဲထုတ်ရမည်</span>`;
        } else {
            statusBadge = `<span class="bg-amber-500/20 text-amber-300 text-xs px-2.5 py-1 rounded-full font-bold">⏳ ${daysLeft} ရက် လိုသေးသည်</span>`;
        }

        slotsHtml += `
            <div class="p-4 border border-slate-800 rounded-xl glass-panel flex flex-wrap justify-between items-center gap-3">
                <div>
                    <div class="font-bold text-sm brand-gradient-text">မဲအလှည့် #${t.turnNo} (အစု #${t.shareIndex})</div>
                    <div class="text-xs text-slate-400 num">ထုတ်ယူရမည့်ရက်: <b class="text-white">${t.payoutDate}</b></div>
                </div>
                <div>${statusBadge}</div>
            </div>
        `;
    });

    box.innerHTML = `
        <div class="glass-panel p-6 rounded-2xl shadow space-y-4">
            <div class="border-b border-slate-800 pb-3 flex justify-between items-center">
                <div>
                    <h3 class="font-bold text-lg brand-gradient-text">${member.name} ၏ စာရင်း</h3>
                    <p class="text-xs text-slate-400">ဖုန်း: ${member.phone || '-'} | အစု: <b class="text-amber-400">${member.shares} စာ</b></p>
                </div>
            </div>
            <div class="space-y-3">${slotsHtml || '<p class="text-xs text-slate-500">မဲအလှည့် မရှိသေးပါ။</p>'}</div>
        </div>
    `;
}

// MODAL FUNCTIONS & ZOOM ID GENERATOR
function openJoinModal() { document.getElementById('join-account-modal').classList.replace('hidden', 'flex'); }
function closeJoinModal() { document.getElementById('join-account-modal').classList.replace('flex', 'hidden'); }

function submitJoinAccount() {
    const inputId = document.getElementById('input-join-id').value.trim().toUpperCase();
    if (!inputId) { showToast('Account ID ရိုက်ထည့်ပါ', 'error'); return; }

    connectToAccount(inputId);
    closeJoinModal();
    document.getElementById('input-join-id').value = '';
}

function copyCurrentAccountId() {
    if (!activeAccountId) return;
    navigator.clipboard.writeText(activeAccountId);
    showToast(`Account ID (${activeAccountId}) ကို Copy ယူပြီးပါပြီ`, 'success');
}

function openNewAccountModal() { document.getElementById('new-account-modal').classList.replace('hidden', 'flex'); }
function closeNewAccountModal() { document.getElementById('new-account-modal').classList.replace('flex', 'hidden'); }

function openMemberModal(id = null) {
    const acc = getActiveAccount();
    if (!requireOwner(acc)) return;
    document.getElementById('member-modal').classList.replace('hidden', 'flex');
    if (id) {
        const m = acc.members.find(x => x.id == id);
        document.getElementById('modal-title').textContent = "အဖွဲ့ဝင် ပြင်ဆင်ရန်";
        document.getElementById('member-id').value = m.id;
        document.getElementById('member-name').value = m.name;
        document.getElementById('member-phone').value = m.phone;
        document.getElementById('member-shares').value = m.shares;
    } else {
        document.getElementById('modal-title').textContent = "အဖွဲ့ဝင်အသစ် ထည့်ရန်";
        document.getElementById('member-id').value = "";
        document.getElementById('member-name').value = "";
        document.getElementById('member-phone').value = "";
        document.getElementById('member-shares').value = "1";
    }
}
function closeMemberModal() { document.getElementById('member-modal').classList.replace('flex', 'hidden'); }

// ACCOUNT SETTINGS: EDIT & LEAVE
function openAccountSettingsModal() {
    const acc = getActiveAccount();
    if (!acc) { showToast('အကောင့် ပထမဦးစွာ ရွေးပါ', 'error'); return; }
    const owner = isAccountOwner(acc);
    document.getElementById('settings-acc-id').textContent = acc.id;
    document.getElementById('settings-acc-name').value = acc.name;
    document.getElementById('settings-acc-amount').value = acc.amount;
    document.getElementById('settings-acc-interval').value = acc.interval;
    ['settings-acc-name', 'settings-acc-amount', 'settings-acc-interval'].forEach(id => {
        document.getElementById(id).disabled = !owner;
    });
    document.getElementById('settings-save-btn').classList.toggle('hidden', !owner);
    document.getElementById('settings-readonly-note').classList.toggle('hidden', owner);
    document.getElementById('account-settings-modal').classList.replace('hidden', 'flex');
}
function closeAccountSettingsModal() { document.getElementById('account-settings-modal').classList.replace('flex', 'hidden'); }

function saveAccountSettings() {
    const acc = getActiveAccount();
    if (!acc) return;
    if (!requireOwner(acc)) return;

    const name = document.getElementById('settings-acc-name').value.trim();
    const amount = parseInt(document.getElementById('settings-acc-amount').value) || 0;
    const interval = parseInt(document.getElementById('settings-acc-interval').value) || 0;

    if (!name || amount <= 0 || interval <= 0) {
        showToast('အချက်အလက်များ မှန်ကန်စွာ ဖြည့်ပါ', 'error');
        return;
    }

    acc.name = name;
    acc.amount = amount;
    acc.interval = interval;

    saveCurrentState();
    closeAccountSettingsModal();
    showToast('အကောင့် ဆက်တင်များ သိမ်းဆည်းပြီးပါပြီ', 'success');
}

function leaveCurrentAccount() {
    const acc = getActiveAccount();
    if (!acc) return;

    showConfirm(`"${acc.name}" အကောင့်ကို ဒီစက်ပေါ်မှသာ ဖယ်ရှားမည်ဖြစ်ပြီး Cloud ပေါ်ရှိ အချက်အလက်များ မပျက်ပါ။ Account ID (${acc.id}) ဖြင့် ပြန်ဝင်နိုင်ပါသည်။ ဆက်လက်လုပ်ဆောင်မလား။`, 'ဖယ်ရှားမည်').then(ok => {
        if (!ok) return;
        if (unsubscribeFirestore) { unsubscribeFirestore(); unsubscribeFirestore = null; }
        delete accountsMap[acc.id];
        activeAccountId = Object.keys(accountsMap)[0] || null;
        saveAccountsToStorage();
        closeAccountSettingsModal();
        if (activeAccountId) { connectToAccount(activeAccountId); } else { renderApp(); }
        showToast('အကောင့်ကို ဖယ်ရှားပြီးပါပြီ', 'info');
    });
}

function generateZoomLikeId() {
    const part1 = Math.floor(100 + Math.random() * 900);
    const part2 = Math.floor(100 + Math.random() * 900);
    return `${part1}-${part2}`;
}

function submitCreateAccount() {
    const name = document.getElementById('new-acc-name').value.trim();
    const amount = parseInt(document.getElementById('new-acc-amount').value) || 0;
    const interval = parseInt(document.getElementById('new-acc-interval').value) || 0;
    const startDate = document.getElementById('new-acc-startdate').value;

    if (!name || amount <= 0 || interval <= 0 || !startDate) {
        showToast('အချက်အလက်များ အကုန်ဖြည့်ပါ', 'error');
        return;
    }

    const newAccId = generateZoomLikeId();
    const newAcc = { 
        id: newAccId, 
        name, 
        amount, 
        interval, 
        startDate, 
        members: [], 
        turns: [],
        createdBy: currentUser ? currentUser.uid : null
    };

    accountsMap[newAccId] = newAcc;
    connectToAccount(newAccId);
    saveCurrentState();

    closeNewAccountModal();
    document.getElementById('new-acc-name').value = '';
    showToast(`"${name}" အကောင့်အသစ် ဖွင့်လှစ်ပြီးပါပြီ (ID: ${newAccId})`, 'success');
}

// QUALITY-OF-LIFE: CLICK-OUTSIDE & ESC TO CLOSE MODALS
const dismissableModals = [
    { id: 'join-account-modal', close: closeJoinModal },
    { id: 'new-account-modal', close: closeNewAccountModal },
    { id: 'member-modal', close: closeMemberModal },
    { id: 'account-settings-modal', close: closeAccountSettingsModal },
    { id: 'payment-modal', close: closePaymentModal },
    { id: 'manual-assign-modal', close: closeManualAssignModal }
];
dismissableModals.forEach(({ id, close }) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', e => { if (e.target === el) close(); });
});
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    dismissableModals.forEach(({ id, close }) => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) close();
    });
    if (!document.getElementById('confirm-modal').classList.contains('hidden')) closeConfirmModal(false);
});

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.className = "tab-btn px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-slate-300 border border-slate-800");
    document.getElementById(`view-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-${tabName}`).className = "tab-btn px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-500/20";
        }
