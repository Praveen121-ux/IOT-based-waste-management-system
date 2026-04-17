/******************* CONFIG *******************/
const firebaseConfig = {
  apiKey: "AIzaSyBqmi7BvkwDxas0tMzEyrIaCMkahCXPbQk",
  authDomain: "iot-waste-management-cse.firebaseapp.com",
  databaseURL: "https://iot-waste-management-cse-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "iot-waste-management-cse",
  storageBucket: "iot-waste-management-cse.firebasestorage.app",
  messagingSenderId: "128147115180",
  appId: "1:128147115180:web:345c66adccbae945602309",
  measurementId: "G-LB196KCCEM"
};

const MANUAL_SMS_URL = "https://smart-waste-server-p598.onrender.com/api/manual_sms";
/************************************************/

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/********** FIX: direct reference **********/
const BIN_REF = db.ref("bins/BIN_001");

/********** UI ELEMENTS **********/
const fillValueEl = document.getElementById("fillValue");
const gasValueEl = document.getElementById("gasValue");
const lastSeenEl = document.getElementById("lastSeen");
const alertsListEl = document.getElementById("alertsList");
const historyTbody = document.querySelector("#historyTable tbody");
const refreshBtn = document.getElementById("refreshBtn");

const smsStatusCard = document.getElementById("smsStatusCard");
const smsStatusIcon = document.getElementById("smsStatusIcon");
const smsStatusText = document.getElementById("smsStatusText");
const smsRetryBtn = document.getElementById("smsRetryBtn");

/********** Thresholds **********/
const THRESH = { fill: 80, gas: 150 };

/********** CHART SETUP **********/
let lineChart = null;

let lineData = {
  labels: [],
  datasets: [{
    label: 'Fill %',
    data: [],
    borderColor: '#0d6efd',
    backgroundColor: 'rgba(13,110,253,0.08)',
    tension: 0.25
  }]
};

function createGauge(ctx, color) {
  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['value', 'rest'],
      datasets: [{
        data: [0, 100],
        backgroundColor: [color, '#f1f3f5'],
        hoverOffset: 0
      }]
    },
    options: {
      cutout: '75%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { duration: 400 }
    }
  });
}

function initCharts() {
  const ctxLine = document.getElementById('lineChart').getContext('2d');

  lineChart = new Chart(ctxLine, {
    type: 'line',
    data: lineData,
    options: {
      responsive: true,
      scales: { y: { min: 0, max: 100 } },
      plugins: { legend: { display: false } }
    }
  });

  window.fillGauge = createGauge(document.createElement('canvas').getContext('2d'), '#0d6efd');
  window.gasGauge = createGauge(document.createElement('canvas').getContext('2d'), '#20c997');

  document.getElementById('fillGauge').appendChild(window.fillGauge.canvas);
  document.getElementById('gasGauge').appendChild(window.gasGauge.canvas);
}

function updateGauge(g, val) {
  const v = Math.max(0, Math.min(100, Math.round(val)));
  g.data.datasets[0].data = [v, 100 - v];
  g.update();
}

/********** ALERTS **********/
function pushAlert(text, type) {
  const li = document.createElement('li');
  li.className = 'list-group-item';

  li.innerHTML = `
    <strong>${text}</strong>
    <div class="text-muted small">${new Date().toLocaleString()}</div>
  `;

  alertsListEl.prepend(li);

  while (alertsListEl.children.length > 8) {
    alertsListEl.removeChild(alertsListEl.lastChild);
  }
}

/********** HISTORY (FIX: avoid duplicates) **********/
let lastTimestamp = 0;

function pushHistory(ts, fill, gas) {
  if (ts === lastTimestamp) return; // ✅ prevent duplicate updates
  lastTimestamp = ts;

  const tr = document.createElement('tr');

  tr.innerHTML = `
    <td>${new Date(ts).toLocaleString()}</td>
    <td>${fill}%</td>
    <td>${gas}</td>
  `;

  historyTbody.prepend(tr);

  while (historyTbody.children.length > 10) {
    historyTbody.removeChild(historyTbody.lastChild);
  }
}

/********** SMS UI **********/
function updateSmsUI(status) {
  if (!status || status === "none") {
    smsStatusCard.style.display = "none";
    return;
  }

  smsStatusCard.style.display = "block";

  if (status === "sent") {
    smsStatusIcon.innerHTML = `<i class="fa fa-check-circle" style="color:#198754;font-size:30px;"></i>`;
    smsStatusText.innerText = "SMS Sent Successfully";
    smsRetryBtn.style.display = "none";
  } else {
    smsStatusIcon.innerHTML = `<i class="fa fa-exclamation-circle" style="color:#dc3545;font-size:30px;"></i>`;
    smsStatusText.innerText = "SMS Failed — Try again";
    smsRetryBtn.style.display = "inline-block";
  }
}

/********** RETRY SMS **********/
smsRetryBtn.addEventListener("click", async () => {
  smsRetryBtn.disabled = true;
  smsRetryBtn.innerText = "Sending...";

  try {
    const res = await fetch(MANUAL_SMS_URL, { method: "POST" });
    const data = await res.json();
    updateSmsUI(data.smsStatus || "failed");
  } catch (err) {
    updateSmsUI("failed");
  }

  smsRetryBtn.disabled = false;
  smsRetryBtn.innerText = "Retry SMS";
});

/********** THRESHOLD CHECK **********/
let lastState = { fill: false, gas: false };

function checkThresholds(data) {
  if (data.fill_level >= THRESH.fill) {
    if (!lastState.fill)
      pushAlert(`Fill level high (${data.fill_level}%)`, 'danger');

    lastState.fill = true;
    document.getElementById('fillStatus').innerText = 'Status: FULL';
  } else {
    lastState.fill = false;
    document.getElementById('fillStatus').innerText = 'Status: Normal';
  }

  if (data.gas_level >= THRESH.gas) {
    if (!lastState.gas)
      pushAlert(`Gas high (${data.gas_level})`, 'danger');

    lastState.gas = true;
    document.getElementById('gasStatus').innerText = 'Status: Dangerous';
  } else {
    lastState.gas = false;
    document.getElementById('gasStatus').innerText = 'Status: Normal';
  }
}

/********** MAIN UPDATE **********/
function updateUI(data) {
  if (!data) return;

  const ts = data.timestamp || Date.now();

  fillValueEl.innerText = data.fill_level + "%";
  gasValueEl.innerText = data.gas_level;

  lastSeenEl.innerText = "Last update: " + new Date(ts).toLocaleString();

  updateGauge(window.fillGauge, data.fill_level);
  updateGauge(window.gasGauge, Math.min(100, data.gas_level / 3));

  pushHistory(ts, data.fill_level, data.gas_level);

  lineData.labels.push(new Date(ts).toLocaleTimeString());
  lineData.datasets[0].data.push(data.fill_level);

  if (lineData.labels.length > 60) {
    lineData.labels.shift();
    lineData.datasets[0].data.shift();
  }

  lineChart.update();

  checkThresholds(data);
  updateSmsUI(data.smsStatus);
}

/********** FIREBASE LISTENER (FIXED) **********/
BIN_REF.on("value", snap => {
  updateUI(snap.val());
});

/********** MANUAL REFRESH **********/
refreshBtn.addEventListener("click", async () => {
  const snap = await BIN_REF.once("value");
  updateUI(snap.val());
});

initCharts();
