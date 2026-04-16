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
const SMS_API_KEY = "YOUR_API_KEY";
const ALERT_NUMBER = "9080865052";
// -------------------------------------------------

// Internal alert state
const alertState = {};
// alertState["BIN_001"] = { fill:false, gas:false };

const lastAlertMessage = {};

// -------------------------------------------------
// SEND SMS
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
      {
        headers: { authorization: SMS_API_KEY }
      }
    );

    console.log("SMS SENT:", message);
    return "sent";

  } catch (e) {

    console.log("SMS FAILED:", e.message);
    return "failed";
  }
}

// -------------------------------------------------
// MANUAL SMS API
// -------------------------------------------------
app.post('/api/manual_sms', async (req, res) => {

  try {

    const bin_id = "BIN_001";

    const lastMsg = lastAlertMessage[bin_id];

    if (!lastMsg) {
      return res.json({ ok:false, smsStatus:"failed", error:"No previous alert"});
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
// MAIN ESP32 DATA API
// -------------------------------------------------
app.post('/api/data', async (req, res) => {

  try {

    const p = req.body;
    const bin_id = p.bin_id;

    if (!bin_id)
      return res.status(400).json({ error: "missing bin_id" });

    // Create bin state
    if (!alertState[bin_id]) {
      alertState[bin_id] = { fill:false, gas:false };
    }

    const state = alertState[bin_id];
    const binRef = db.ref(`bins/${bin_id}`);

    // Preserve previous sms status
    const previousSnap = await binRef.once("value");
    const prevSmsStatus = previousSnap.val()?.smsStatus || "none";

    const payload = {

      fill_level: p.fill_level,
      gas_level: p.gas_level,
      timestamp: Date.now(),
      smsStatus: prevSmsStatus

    };

    await binRef.set(payload);
    await db.ref(`history/${bin_id}`).push(payload);

    console.log("DATA RECEIVED:", payload);

    let alertMsg = null;
    let smsStatus = "none";

    // -------------------------
    // FILL ALERT
    // -------------------------
    if (payload.fill_level >= 80 && !state.fill) {

      alertMsg = `ALERT! Bin ${bin_id} Fill HIGH: ${payload.fill_level}%`;

      smsStatus = await sendSMS(alertMsg);

      state.fill = true;
    }

    if (payload.fill_level < 50)
      state.fill = false;


    // -------------------------
    // GAS ALERT
    // -------------------------
    if (payload.gas_level >= 150 && !state.gas) {

      alertMsg = `ALERT! Bin ${bin_id} GAS HIGH: ${payload.gas_level}`;

      smsStatus = await sendSMS(alertMsg);

      state.gas = true;
    }

    if (payload.gas_level < 80)
      state.gas = false;


    // Store last alert message
    if (alertMsg)
      lastAlertMessage[bin_id] = alertMsg;


    // Update SMS status in firebase
    if (smsStatus !== "none") {

      await binRef.update({

        smsStatus: smsStatus,
        smsTimestamp: Date.now()

      });

    }

    return res.json({ ok:true, smsStatus });

  } catch (err) {

    console.error(err);

    return res.status(500).json({ error: "server error" });

  }

});

app.get('/', (req,res)=>res.send("Smart Waste API Running"));

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>console.log("Server running on port",PORT));
