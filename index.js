const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

/* =======================
   FIREBASE INIT (ENV)
======================= */
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT is missing");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/* =======================
   ROOT ROUTE (FIX Cannot GET /)
======================= */
app.get("/", (req, res) => {
  res.send("✅ Key system is running");
});

/* =======================
   VERIFY KEY API
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

    // Key bị khóa
    if (data.banned === true) {
      return res.json({
        success: false,
        message: "Key đã bị khóa",
      });
    }

    // Hết hạn
    if (data.expireAt && data.expireAt.toDate() < new Date()) {
      return res.json({
        success: false,
        message: "Key đã hết hạn",
      });
    }

    // Chưa bind HWID → bind lần đầu
    if (!data.hwid) {
      await ref.update({
        hwid,
        activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

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

    // OK
    return res.json({
      success: true,
      message: "Key hợp lệ",
    });

  } catch (err) {
    console.error("VERIFY ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* =======================
   START SERVER (RENDER)
======================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});