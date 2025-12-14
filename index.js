const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

/* =======================
   FIREBASE INIT
======================= */
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ Missing FIREBASE_SERVICE_ACCOUNT env");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/* =======================
   ROOT (TEST SERVER)
======================= */
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Key system server is running",
  });
});

/* =======================
   VERIFY KEY
   /verify?key=XXX&hwid=YYY
======================= */
app.get("/verify", async (req, res) => {
  const { key, hwid } = req.query;

  if (!key || !hwid) {
    return res.json({
      success: false,
      message: "Thiếu key hoặc hwid",
    });
  }

  try {
    const ref = db.collection("keys").doc(key);
    const snap = await ref.get();

    if (!snap.exists) {
      return res.json({
        success: false,
        message: "Key không tồn tại",
      });
    }

    const data = snap.data();

    if (data.banned === true) {
      return res.json({
        success: false,
        message: "Key đã bị khóa",
      });
    }

    if (data.expireAt && data.expireAt.toDate() < new Date()) {
      return res.json({
        success: false,
        message: "Key đã hết hạn",
      });
    }

    // Bind HWID lần đầu
    if (!data.hwid) {
      await ref.update({ hwid });
      return res.json({
        success: true,
        message: "Key kích hoạt thành công",
      });
    }

    // Sai HWID
    if (data.hwid !== hwid) {
      return res.json({
        success: false,
        message: "Sai HWID",
      });
    }

    return res.json({
      success: true,
      message: "Key hợp lệ",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* =======================
   ADMIN - CREATE KEY
   /createKey?token=XXX&days=30
======================= */
app.get("/createKey", async (req, res) => {
  const { token, days } = req.query;

  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const key = Math.random()
    .toString(36)
    .substring(2, 12)
    .toUpperCase();

  let expireAt = null;
  if (days) {
    expireAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000)
    );
  }

  try {
    await db.collection("keys").doc(key).set({
      hwid: null,
      banned: false,
      expireAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({
      success: true,
      key,
      expireAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Cannot create key",
    });
  }
});

/* =======================
   START SERVER (RENDER)
======================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});
