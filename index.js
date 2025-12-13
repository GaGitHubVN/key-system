const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Firebase init
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * GET /verify?key=XXX&hwid=YYY
 */
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

    if (data.banned === true) {
      return res.json({ success: false, message: "Key đã bị khóa" });
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

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Render dùng PORT env
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
