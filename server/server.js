const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://iot-waste-management-cse-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// -------------------------------------------------
// CONFIG — replace with your real values
// -------------------------------------------------
const SMS_API_KEY = "nIaGA14gC3S8yiUKwQhtFxYLbvdW20mOXuNMprDszH7klf6cj91d03mIMZuUhHN7tsa9FDjW4f2LSAcB";
const ALERT_NUMBER = "9080865052";

// -------------------------------------------------
// Internal alert state PER BIN
// -------------------------------------------------
const alertState = {}; 
// alertState["BIN_001"] = { fill:false, gas:false, weight:false };

const lastAlertMessage = {}; // stores latest alert msg per bin

// -------------------------------------------------
// SEND SMS FUNCTION
// -------------------------------------------------
async function sendSMS(message) {
  try {
    await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      { 
        route: "v3",
        sender_id: "TXTIND",
        message,
        language: "english",
        numbers: ALERT_NUMBER 
      },
      { headers: { authorization: SMS_API_KEY } }
    );
    
    console.log("✔ SMS SENT:", message);
    return "sent";

  } catch (e) {
    console.error("✖ SMS FAILED:", e.message);
    return "failed";
  }
}

// -------------------------------------------------
// ⭐ MANUAL SMS RESEND API
// -------------------------------------------------
app.post('/api/manual_sms', async (req, res) => {
  try {
    const bin_id = "BIN_001";  // << fixed for your system

    const lastMsg = lastAlertMessage[bin_id];
    if (!lastMsg) {
      return res.json({ ok:false, smsStatus:"failed", error:"No previous alert" });
    }

    const status = await sendSMS(lastMsg);

    await db.ref(`bins/${bin_id}`).update({
      smsStatus: status,
      smsTimestamp: Date.now()
    });

    return res.json({ ok: status === "sent", smsStatus: status });

  } catch (err) {
    return res.json({ ok:false, smsStatus:"failed" });
  }
});

// -------------------------------------------------
// ⭐ MAIN ARDUINO DATA API
// -------------------------------------------------
app.post('/api/data', async (req, res) => {
  try {
    const p = req.body;
    const bin_id = p.bin_id;

    if (!bin_id)
      return res.status(400).json({ error: "missing bin_id" });

    // Create state for bin if not exist
    if (!alertState[bin_id]) {
      alertState[bin_id] = { fill:false, gas:false, weight:false };
    }

    const state = alertState[bin_id];
    const binRef = db.ref(`bins/${bin_id}`);

    // Get latest smsStatus from firebase to preserve UI state
    const previousSnap = await binRef.once("value");
    const prevSmsStatus = previousSnap.val()?.smsStatus || "none";

    const payload = {
      fill_level: p.fill_level,
      gas_level: p.gas_level,
      weight: p.weight,
      timestamp: Date.now(),
      smsStatus: prevSmsStatus   // << KEEP STATUS (do NOT reset)
    };

    await binRef.set(payload);
    await db.ref(`history/${bin_id}`).push(payload);

    console.log("DATA RECEIVED:", payload);

    let alertMsg = null;
    let smsStatus = "none";

    // ---------------------------
    // FILL ALERT
    // ---------------------------
    if (payload.fill_level >= 80 && !state.fill) {
      alertMsg = `ALERT! Bin ${bin_id} Fill HIGH: ${payload.fill_level}%`;
      smsStatus = await sendSMS(alertMsg);
      state.fill = true;
    }
    if (payload.fill_level < 50) state.fill = false;

    // ---------------------------
    // GAS ALERT
    // ---------------------------
    if (payload.gas_level >= 150 && !state.gas) {
      alertMsg = `ALERT! Bin ${bin_id} GAS HIGH: ${payload.gas_level} ppm`;
      smsStatus = await sendSMS(alertMsg);
      state.gas = true;
    }
    if (payload.gas_level < 80) state.gas = false;

    // ---------------------------
    // WEIGHT ALERT
    // ---------------------------
    if (payload.weight >= 15 && !state.weight) {
      alertMsg = `ALERT! Bin ${bin_id} WEIGHT HIGH: ${payload.weight} kg`;
      smsStatus = await sendSMS(alertMsg);
      state.weight = true;
    }
    if (payload.weight < 5) state.weight = false;

    // ---------------------------
    // Store last message for manual resend
    // ---------------------------
    if (alertMsg) lastAlertMessage[bin_id] = alertMsg;

    // ---------------------------
    // Update Firebase with SMS status
    // ---------------------------
    if (smsStatus !== "none") {
      await binRef.update({
        smsStatus: smsStatus,
        smsTimestamp: Date.now(),
      });
    }

    return res.json({ ok:true, smsStatus });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
});

app.get('/', (req, res) => res.send("Smart Waste API Running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
