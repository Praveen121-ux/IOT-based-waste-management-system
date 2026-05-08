const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cors = require('cors');

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://iot-waste-management-cse-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();
const app = express();

// ✅ STATIC FRONTEND
app.use(express.static("public"));

app.use(cors());
app.use(bodyParser.json());

// -------------------------------------------------
const alertState = {};
// (kept structure, but not used for SMS now)
// -------------------------------------------------

// -------------------------------------------------
// MAIN ESP32 DATA API (ONLY SMS REMOVED)
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
      weight: Number(p.weight || 0), // ✅ added
      timestamp: Date.now(),
      smsStatus: p.smsStatus || "none" // ✅ from ESP32
    };

    console.log("WRITING TO FIREBASE:", payload);

    // ✅ same as your code
    await binRef.update(payload);
    await db.ref(`history/${bin_id}`).push(payload);

    // -------------------------
    // ALERT LOGIC (KEPT, but NO SMS)
    // -------------------------

    // FILL ALERT
    if (payload.fill_level >= 80 && !state.fill) {
      console.log(`ALERT: Bin ${bin_id} Fill HIGH`);
      state.fill = true;
    }

    if (payload.fill_level < 50) {
      state.fill = false;
    }

    // GAS ALERT
    if (payload.gas_level >= 150 && !state.gas) {
      console.log(`ALERT: Bin ${bin_id} GAS HIGH`);
      state.gas = true;
    }

    if (payload.gas_level < 80) {
      state.gas = false;
    }

    return res.json({ ok: true });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "server error" });
  }

});

// -------------------------------------------------
app.get('/', (req, res) => res.send("Smart Waste API Running"));

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => console.log("Server running on port", PORT));
