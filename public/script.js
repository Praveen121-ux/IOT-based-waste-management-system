/*******************  CONFIG *******************/
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
/************************************************/

firebase.initializeApp(firebaseConfig);

const db = firebase.database();

const BIN_PATH = "bins/BIN_001";

/********** UI ELEMENTS **********/
const fillValueEl = document.getElementById("fillValue");
const gasValueEl = document.getElementById("gasValue");
const weightValueEl = document.getElementById("weightValue");
const lastSeenEl = document.getElementById("lastSeen");

const alertsListEl =
  document.getElementById("alertsList");

const historyTbody =
  document.querySelector("#historyTable tbody");

const refreshBtn =
  document.getElementById("refreshBtn");

/********** SMS STATUS UI **********/
const smsStatusCard =
  document.getElementById("smsStatusCard");

const smsStatusIcon =
  document.getElementById("smsStatusIcon");

const smsStatusTitle =
  document.getElementById("smsStatusTitle");

const smsStatusText =
  document.getElementById("smsStatusText");

/********** THRESHOLDS **********/
const THRESH = {
  fill: 80,
  gas: 1000,
  weight: 15
};

/********** CHART **********/
let lineChart = null;

let lineData = {
  labels: [],
  datasets: [{
    label: 'Fill %',
    data: [],
    borderColor:'#0d6efd',
    backgroundColor:'rgba(13,110,253,0.08)',
    tension:0.25
  }]
};

/********** CREATE GAUGE **********/
function createGauge(ctx,color){

  return new Chart(ctx,{

    type:'doughnut',

    data:{
      labels:['value','rest'],
      datasets:[{
        data:[0,100],
        backgroundColor:[color,'#f1f3f5'],
        hoverOffset:0
      }]
    },

    options:{
      cutout:'75%',

      plugins:{
        legend:{display:false},
        tooltip:{enabled:false}
      },

      animation:{duration:400}
    }
  });
}

/********** INIT CHARTS **********/
function initCharts(){

  const ctxLine =
    document.getElementById('lineChart')
    .getContext('2d');

  lineChart = new Chart(ctxLine,{

    type:'line',

    data:lineData,

    options:{

      responsive:true,

      scales:{
        y:{
          min:0,
          max:100
        }
      },

      plugins:{
        legend:{display:false}
      }
    }
  });

  window.fillGauge =
    createGauge(
      document.createElement('canvas')
      .getContext('2d'),
      '#0d6efd'
    );

  window.gasGauge =
    createGauge(
      document.createElement('canvas')
      .getContext('2d'),
      '#20c997'
    );

  window.weightGauge =
    createGauge(
      document.createElement('canvas')
      .getContext('2d'),
      '#ffb703'
    );

  document.getElementById('fillGauge')
    .appendChild(window.fillGauge.canvas);

  document.getElementById('gasGauge')
    .appendChild(window.gasGauge.canvas);

  document.getElementById('weightGauge')
    .appendChild(window.weightGauge.canvas);
}

/********** UPDATE GAUGE **********/
function updateGauge(g,val){

  const v =
    Math.max(0,Math.min(100,Math.round(val)));

  g.data.datasets[0].data = [v,100-v];

  g.update();
}

/********** ALERTS **********/
function pushAlert(text,type){

  const li = document.createElement('li');

  li.className = 'list-group-item';

  if(type==='danger')
    li.classList.add('alert-item-danger');

  else if(type==='warn')
    li.classList.add('alert-item-warn');

  else
    li.classList.add('alert-item-ok');

  li.innerHTML = `
    <strong>${text}</strong>
    <div class="text-muted small">
      ${new Date().toLocaleString()}
    </div>
  `;

  alertsListEl.prepend(li);

  // ONLY LAST 5 ALERTS
  while(alertsListEl.children.length > 5){

    alertsListEl.removeChild(
      alertsListEl.lastChild
    );
  }
}

/********** HISTORY **********/
function pushHistory(ts,fill,gas,weight){

  // PREVENT DUPLICATE
  const firstRow = historyTbody.firstChild;

  if(firstRow &&
     firstRow.dataset.time == ts){

    return;
  }

  const tr = document.createElement('tr');

  tr.dataset.time = ts;

  tr.innerHTML = `
    <td>${new Date(ts).toLocaleString()}</td>
    <td>${fill}%</td>
    <td>${gas}</td>
    <td>${weight}</td>
  `;

  historyTbody.prepend(tr);

  // ONLY LAST 5 HISTORY
  while(historyTbody.children.length > 5){

    historyTbody.removeChild(
      historyTbody.lastChild
    );
  }
}

/********** SMS STATUS **********/
function updateSmsUI(status,data){

  const isProblem =

    data.fill_level >= THRESH.fill ||

    data.gas_level >= THRESH.gas ||

    data.weight >= THRESH.weight;

  // REMOVE WHEN NORMAL
  if(!isProblem){

    smsStatusCard.style.display = "none";

    return;
  }

  smsStatusCard.style.display = "block";

  // GAS ALERT
  if(data.gas_level >= THRESH.gas){

    smsStatusTitle.innerText =
      "GAS ALERT";

    smsStatusIcon.innerHTML =
      `<i class="fa fa-triangle-exclamation"
      style="color:#dc3545;font-size:30px;"></i>`;

    smsStatusText.innerText =
      "Dangerous Gas Detected";
  }

  // BIN FULL
  else if(data.fill_level >= THRESH.fill){

    smsStatusTitle.innerText =
      "BIN FULL";

    smsStatusIcon.innerHTML =
      `<i class="fa fa-trash"
      style="color:#ffc107;font-size:30px;"></i>`;

    smsStatusText.innerText =
      "Dustbin Needs Collection";
  }

  // OVERWEIGHT
  else if(data.weight >= THRESH.weight){

    smsStatusTitle.innerText =
      "OVERWEIGHT";

    smsStatusIcon.innerHTML =
      `<i class="fa fa-weight-scale"
      style="color:#fd7e14;font-size:30px;"></i>`;

    smsStatusText.innerText =
      "Dustbin Overloaded";
  }

  // SMS STATUS
  if(status === "sent"){

    smsStatusText.innerText +=
      " • SMS Sent";
  }

  else if(status === "failed"){

    smsStatusText.innerText +=
      " • SMS Failed";
  }
}

/********** THRESHOLD LOGIC **********/
let lastState = {
  fill:false,
  gas:false,
  weight:false
};

function checkThresholds(data){

  // FILL
  if(data.fill_level >= THRESH.fill){

    if(!lastState.fill){

      pushAlert(
        `Fill level high (${data.fill_level}%)`,
        'danger'
      );
    }

    lastState.fill = true;

    document.getElementById('fillStatus')
      .innerText =
      'Status: FULL / Needs collection';
  }

  else{

    if(lastState.fill){

      pushAlert(
        `Fill back to safe (${data.fill_level}%)`,
        'ok'
      );
    }

    lastState.fill = false;

    document.getElementById('fillStatus')
      .innerText='Status: Normal';
  }

  // GAS
  if(data.gas_level >= THRESH.gas){

    if(!lastState.gas){

      pushAlert(
        `High gas detected (${data.gas_level} ppm)`,
        'danger'
      );
    }

    lastState.gas = true;

    document.getElementById('gasStatus')
      .innerText='Status: Dangerous';
  }

  else{

    if(lastState.gas){

      pushAlert(
        `Gas back to normal (${data.gas_level} ppm)`,
        'ok'
      );
    }

    lastState.gas = false;

    document.getElementById('gasStatus')
      .innerText='Status: Normal';
  }

  // WEIGHT
  if(data.weight >= THRESH.weight){

    if(!lastState.weight){

      pushAlert(
        `Weight exceeded (${data.weight} kg)`,
        'warn'
      );
    }

    lastState.weight = true;

    document.getElementById('weightStatus')
      .innerText='Status: Heavy';
  }

  else{

    if(lastState.weight){

      pushAlert(
        `Weight back to normal (${data.weight} kg)`,
        'ok'
      );
    }

    lastState.weight = false;

    document.getElementById('weightStatus')
      .innerText='Status: Normal';
  }
}

/********** MAIN UPDATE **********/
function updateUIFromData(dataObj){

  if(!dataObj) return;

  const ts =
    dataObj.timestamp || Date.now();

  fillValueEl.innerText =
    dataObj.fill_level + " %";

  gasValueEl.innerText =
    dataObj.gas_level + " ppm";

  weightValueEl.innerText =
    dataObj.weight + " kg";

  lastSeenEl.innerText =
    "Last update: " +
    new Date(ts).toLocaleString();

  updateGauge(
    window.fillGauge,
    dataObj.fill_level
  );

  updateGauge(
    window.gasGauge,
    Math.min(100,dataObj.gas_level/3)
  );

  updateGauge(
    window.weightGauge,
    Math.min(100,dataObj.weight*6)
  );

  pushHistory(
    ts,
    dataObj.fill_level,
    dataObj.gas_level,
    dataObj.weight
  );

  lineData.labels.push(
    new Date(ts).toLocaleTimeString()
  );

  lineData.datasets[0].data.push(
    dataObj.fill_level
  );

  if(lineData.labels.length > 60){

    lineData.labels.shift();

    lineData.datasets[0].data.shift();
  }

  lineChart.update();

  checkThresholds(dataObj);

  updateSmsUI(
    dataObj.smsStatus,
    dataObj
  );
}

/********** FIREBASE REALTIME **********/
db.ref(BIN_PATH).on("value", snap=>{

  updateUIFromData(snap.val());
});

/********** REFRESH **********/
refreshBtn.addEventListener("click",()=>{

  location.reload();
});

/********** INIT **********/
initCharts();
