const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

// ===== Firebase init =====
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ===== Helper =====
function checkAdmin(req, res) {
  const token = req.query.token;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    res.status(403).json({ success: false, message: "Unauthorized" });
    return false;
  }
  return true;
}

function genKey() {
  return crypto.randomBytes(16).toString("hex").toUpperCase();
}

// ===== Root =====
app.get("/", (req, res) => {
  res.send("Key System API is running");
});

// ===== VERIFY =====
app.get("/verify", async (req, res) => {
  const { key, hwid } = req.query;

  if (!key || !hwid) {
    return res.json({ success: false, message: "Thiếu key hoặc hwid" });
  }

  try {
    const ref = db.collection("keys").doc(key);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.json({ success: false, message: "Key không tồn tại" });
    }

    const data = snap.data();

    if (data.banned) {
      return res.json({ success: false, message: "Key đã bị ban" });
    }

    if (data.expireAt && data.expireAt.toDate() < new Date()) {
      return res.json({ success: false, message: "Key đã hết hạn" });
    }

    if (!data.hwid) {
      await ref.update({ hwid });
      return res.json({ success: true, message: "Key kích hoạt thành công" });
    }

    if (data.hwid !== hwid) {
      return res.json({ success: false, message: "Sai HWID" });
    }

    return res.json({ success: true, message: "Key hợp lệ" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ===== CREATE KEY =====
app.get("/createKey", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  const days = parseInt(req.query.days || "0");
  const key = genKey();

  const data = {
    hwid: null,
    banned: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expireAt: days > 0
      ? admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + days * 86400000)
        )
      : null,
  };

  await db.collection("keys").doc(key).set(data);
  res.json({ success: true, key });
});

// ===== BAN KEY =====
app.get("/banKey", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  const { key } = req.query;
  if (!key) return res.json({ success: false });

  await db.collection("keys").doc(key).update({ banned: true });
  res.json({ success: true, message: "Key đã bị ban" });
});

// ===== UNBAN KEY =====
app.get("/unbanKey", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  const { key } = req.query;
  if (!key) return res.json({ success: false });

  await db.collection("keys").doc(key).update({ banned: false });
  res.json({ success: true, message: "Key đã được unban" });
});

// ===== RESET HWID =====
app.get("/resetHWID", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  const { key } = req.query;
  if (!key) return res.json({ success: false });

  await db.collection("keys").doc(key).update({ hwid: null });
  res.json({ success: true, message: "Reset HWID thành công" });
});

// ===== LIST KEYS (DASHBOARD) =====
app.get("/listKeys", async (req, res) => {
  if (!checkAdmin(req, res)) return;

  const snap = await db.collection("keys").get();
  const keys = [];

  snap.forEach(doc => {
    keys.push({ key: doc.id, ...doc.data() });
  });

  res.json({ success: true, keys });
});

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Key System running on port", PORT);
});
