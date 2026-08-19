// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCkzQP5GIabzQTUo9d9q98Ih0y1gDqFi7A",
    authDomain: "tribleone-30cb8.firebaseapp.com",
    projectId: "tribleone-30cb8",
    storageBucket: "tribleone-30cb8.firebasestorage.app",
    messagingSenderId: "880025708456",
    appId: "1:880025708456:web:abebfc77ed6651279d9f9d"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let savedAccountsList = [];
let activeAccountId = null;

// Notification Toast Alert
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const colors = {
        success: 'border-emerald-500/40 text-emerald-400',
        error: 'border-rose-500/40 text-rose-400',
        info: 'border-amber-500/40 text-amber-400'
    };
    const toast = document.createElement('div');
    toast.className = `glass-panel border ${colors[type]} rounded-xl px-4 py-3 shadow-2xl text-xs font-bold`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Safety Deletion Protection Confirmation Modal
let confirmResolver = null;
function showConfirm(message) {
    document.getElementById('confirm-modal-text').textContent = message;
    document.getElementById('confirm-modal').classList.replace('hidden', 'flex');
    return new Promise(resolve => { confirmResolver = resolve; });
}

function closeConfirmModal(result) {
    document.getElementById('confirm-modal').classList.replace('flex', 'hidden');
    if (confirmResolver) { confirmResolver(result); confirmResolver = null; }
}

// Auth State Monitor & Google Sync Initialization
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('login-view').classList.add('hidden');
        document.getElementById('app-view').classList.remove('hidden');
        document.getElementById('user-photo').src = user.photoURL || 'https://via.placeholder.com/150';

        // Synchronize user state & sync accounts list from Cloud Database
        syncUserCloudData();
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

// Sync Saved Accounts List exclusively from Cloud Database
function syncUserCloudData() {
    if (!currentUser) return;

    db.collection("users").doc(currentUser.uid).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            savedAccountsList = data.savedAccounts || [];
            fetchAccountsDetails(savedAccountsList);
        } else {
            db.collection("users").doc(currentUser.uid).set({
                uid: currentUser.uid,
                email: currentUser.email,
                savedAccounts: []
            });
            renderAccountCardList([]);
        }
    });
}

// Fetch Detailed Account Info for Cards
async function fetchAccountsDetails(accIds) {
    if (!accIds || accIds.length === 0) {
        renderAccountCardList([]);
        return;
    }

    const fetchedDetails = [];
    for (let id of accIds) {
        const doc = await db.collection("rosca_accounts").doc(id).get();
        if (doc.exists) {
            fetchedDetails.push({ id: doc.id, ...doc.data() });
        }
    }
    renderAccountCardList(fetchedDetails);
}

// Strict Ownership Check
function isAccountOwner(account) {
    if (!account || !account.createdBy) return true;
    return currentUser && currentUser.uid === account.createdBy;
}

// Render Saved Accounts List View
function renderAccountCardList(accounts) {
    const container = document.getElementById('accounts-card-list');
    container.innerHTML = '';

    if (accounts.length === 0) {
        container.innerHTML = `<div class="glass-panel p-6 rounded-2xl text-center text-xs text-slate-500">ချိတ်ဆက်ထားသော အကောင့်မရှိသေးပါ။ ID ဖြင့်ဝင်ပါ သို့မဟုတ် အကောင့်သစ်ဖန်တီးပါ။</div>`;
        return;
    }

    accounts.forEach(acc => {
        const isOwner = isAccountOwner(acc);
        const card = document.createElement('div');
        card.className = "glass-panel p-4 rounded-xl flex items-center justify-between shadow-lg hover:border-indigo-500/50 transition cursor-pointer";
        card.onclick = () => switchAccount(acc.id);

        card.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-indigo-400 font-bold border border-slate-700">
                    <i class="fa-solid fa-wallet"></i>
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-sm text-white">${acc.name}</span>
                        <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${isOwner ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'}">
                            ${isOwner ? 'Owner' : 'View Only'}
                        </span>
                    </div>
                    <span class="text-xs text-slate-400 font-mono">ID: ${acc.id}</span>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="removeAccountFromList(event, '${acc.id}')" class="w-8 h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center transition" title="ဖျက်ရန်">
                    <i class="fa-solid fa-trash text-xs"></i>
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// Quick Switch Account Routine
function switchAccount(accId) {
    activeAccountId = accId;
    db.collection("rosca_accounts").doc(accId).get().then(doc => {
        if (doc.exists) {
            const acc = doc.data();
            const isOwner = isAccountOwner(acc);
            document.getElementById('header-acc-name').textContent = acc.name;
            document.getElementById('owner-badge').textContent = isOwner ? 'Full Access' : 'Read-Only Mode';
            
            showToast(`"${acc.name}" သို့ ပြောင်းလဲဝင်ရောက်ခဲ့သည် (${isOwner ? ' Full Permission' : ' Read-Only'})`, 'info');
        }
    });
}

// Safety Protection & Account Removal from Cloud Memory
async function removeAccountFromList(event, accId) {
    event.stopPropagation();
    const confirmed = await showConfirm("ဒီအကောင့်ကို စာရင်းမှ ဖျက်မှာ သေချာပါသလား?");
    if (!confirmed) return;

    const updatedList = savedAccountsList.filter(id => id !== accId);
    await db.collection("users").doc(currentUser.uid).update({
        savedAccounts: updatedList
    });

    showToast("အကောင့်ကို စာရင်းမှ ဖယ်ရှားပြီးပါပြီ", "success");
}

// Join Account via ID
async function submitJoinAccount() {
    const accId = document.getElementById('input-join-id').value.trim().toUpperCase();
    if (!accId) { showToast('Account ID ရိုက်ထည့်ပါ', 'error'); return; }

    const doc = await db.collection("rosca_accounts").doc(accId).get();
    if (!doc.exists) {
        showToast('အကောင့် ID ရှာမတွေ့ပါ', 'error');
        return;
    }

    if (!savedAccountsList.includes(accId)) {
        savedAccountsList.push(accId);
        await db.collection("users").doc(currentUser.uid).update({ savedAccounts: savedAccountsList });
    }

    closeJoinModal();
    switchAccount(accId);
}

// Helper: Zoom-style ID Generator
function generateZoomLikeId() {
    return `${Math.floor(100 + Math.random() * 900)}-${Math.floor(100 + Math.random() * 900)}`;
}

// Create New Account Process
async function submitCreateAccount() {
    const name = document.getElementById('new-acc-name').value.trim();
    if (!name) { showToast('အကောင့်အမည် ထည့်သွင်းပါ', 'error'); return; }

    const accId = generateZoomLikeId();
    const newAcc = {
        id: accId,
        name: name,
        createdBy: currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("rosca_accounts").doc(accId).set(newAcc);

    savedAccountsList.push(accId);
    await db.collection("users").doc(currentUser.uid).update({ savedAccounts: savedAccountsList });

    closeNewAccountModal();
    showToast(`"${name}" အကောင့်သစ် ဖွင့်လှစ်ပြီးပါပြီ`, 'success');
}

// Modal Handlers
function openJoinModal() { document.getElementById('join-account-modal').classList.replace('hidden', 'flex'); }
function closeJoinModal() { document.getElementById('join-account-modal').classList.replace('flex', 'hidden'); }
function openNewAccountModal() { document.getElementById('new-account-modal').classList.replace('hidden', 'flex'); }
function closeNewAccountModal() { document.getElementById('new-account-modal').classList.replace('flex', 'hidden'); }

