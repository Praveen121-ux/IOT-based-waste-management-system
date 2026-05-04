const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer'); // ✅ NEW

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://iot-waste-management-cse-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();
const app = express();

app.use(express.static("public"));
app.use(cors());
app.use(bodyParser.json());

// -------------------------------------------------
// ✅ EMAIL CONFIG (NEW)
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// Receiver email
const ALERT_EMAIL = "yourmail@gmail.com"; // change this

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});
// -------------------------------------------------

const alertState = {};
const lastAlertMessage = {};

// -------------------------------------------------
// ✅ SEND EMAIL (REPLACES SMS)
// -------------------------------------------------
async function sendEmail(message) {
  try {
    await transporter.sendMail({
      from: `"Smart Dustbin" <${EMAIL_USER}>`,
      to: ALERT_EMAIL,
      subject: "🚨 Dustbin Alert",
      text: message
    });

    console.log("EMAIL SENT:", message);
    return "sent";

  } catch (e) {
    console.log("EMAIL FAILED:", e.message);
    return "failed";
  }
}

// -------------------------------------------------
// MANUAL EMAIL RESEND
// -------------------------------------------------
app.post('/api/manual_sms', async (req, res) => {
  try {

    const bin_id = "BIN_001";
    const lastMsg = lastAlertMessage[bin_id];

    if (!lastMsg) {
      return res.json({ ok: false, smsStatus: "failed", error: "No previous alert" });
    }

    const status = await sendEmail(lastMsg);

    await db.ref(`bins/${bin_id}`).update({
      smsStatus: status,
      smsTimestamp: Date.now()
    });

    return res.json({ ok: status === "sent", smsStatus: status });

  } catch (err) {
    console.error(err);
    return res.json({ ok: false, smsStatus: "failed" });
  }
});

// -------------------------------------------------
// MAIN ESP32 DATA API
// -------------------------------------------------
app.post('/api/data', async (req, res) => {

  try {

    const p = req.body;
    console.log("ESP32 DATA RECEIVED:", p);

    const bin_id = p.bin_id;

    if (!bin_id) {
      return res.status(400).json({ error: "missing bin_id" });
    }

    if (!alertState[bin_id]) {
      alertState[bin_id] = { fill: false, gas: false };
    }

    const state = alertState[bin_id];
    const binRef = db.ref(`bins/${bin_id}`);

    const payload = {
      fill_level: Number(p.fill_level || 0),
      gas_level: Number(p.gas_level || 0),
      timestamp: Date.now(),
      smsStatus: p.smsStatus || "none"
    };

    await binRef.update(payload);
    await db.ref(`history/${bin_id}`).push(payload);

    let alertMsg = null;
    let smsStatus = "none";

    // -------------------------
    // FILL ALERT
    // -------------------------
    if (payload.fill_level >= 80 && !state.fill) {

      alertMsg = `ALERT! Bin ${bin_id} Fill HIGH: ${payload.fill_level}%`;

      smsStatus = await sendEmail(alertMsg);

      state.fill = true;
    }

    if (payload.fill_level < 50) {
      state.fill = false;
    }

    // -------------------------
    // GAS ALERT
    // -------------------------
    if (payload.gas_level >= 150 && !state.gas) {

      const gasMsg = `ALERT! Bin ${bin_id} GAS HIGH: ${payload.gas_level}`;

      smsStatus = await sendEmail(gasMsg);

      alertMsg = alertMsg ? alertMsg + " | " + gasMsg : gasMsg;

      state.gas = true;
    }

    if (payload.gas_level < 80) {
      state.gas = false;
    }

    if (alertMsg) {
      lastAlertMessage[bin_id] = alertMsg;
    }

    if (smsStatus !== "none") {
      await binRef.update({
        smsStatus: smsStatus,
        smsTimestamp: Date.now()
      });
    }

    return res.json({ ok: true, smsStatus });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "server error" });
  }

});

// -------------------------------------------------
app.get('/', (req, res) => res.send("Smart Waste API Running"));

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => console.log("Server running on port", PORT));
