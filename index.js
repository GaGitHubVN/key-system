const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   Firebase init
========================= */
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/* =========================
   Session (HTTPS cookie)
========================= */
app.set("trust proxy", 1); // Render cần dòng này

app.use(
  session({
    name: "admin_session",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,       // HTTPS
      httpOnly: true,
      sameSite: "none",   // Render
      maxAge: 1000 * 60 * 60 * 6, // 6h
    },
  })
);

/* =========================
   Middleware
========================= */
function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}

/* =========================
   Admin Auth
========================= */
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    req.session.admin = true;
    return res.json({ success: true });
  }

  res.status(401).json({ success: false });
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* =========================
   Dashboard APIs
========================= */
app.get("/admin/keys", requireAdmin, async (req, res) => {
  const snap = await db.collection("keys").get();
  const keys = snap.docs.map((d) => ({ key: d.id, ...d.data() }));
  res.json(keys);
});

app.post("/admin/create-key", requireAdmin, async (req, res) => {
  const key = crypto.randomBytes(8).toString("hex").toUpperCase();

  await db.collection("keys").doc(key).set({
    hwid: null,
    banned: false,
    unlocked: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  res.json({ success: true, key });
});

app.post("/admin/ban", requireAdmin, async (req, res) => {
  const { key, banned } = req.body;
  await db.collection("keys").doc(key).update({ banned });
  res.json({ success: true });
});

app.post("/admin/reset-hwid", requireAdmin, async (req, res) => {
  const { key } = req.body;
  await db.collection("keys").doc(key).update({ hwid: null });
  res.json({ success: true });
});

/* =========================
   Verify + Linkvertise
========================= */
app.get("/verify", async (req, res) => {
  const { key, hwid } = req.query;
  if (!key || !hwid) {
    return res.json({ success: false, message: "Missing key or hwid" });
  }

  const ref = db.collection("keys").doc(key);
  const snap = await ref.get();

  if (!snap.exists) {
    return res.json({ success: false, message: "Invalid key" });
  }

  const data = snap.data();

  if (data.banned) {
    return res.json({ success: false, message: "Key banned" });
  }

  // Chưa vượt linkvertise
  if (!data.unlocked) {
    return res.json({
      success: false,
      linkvertise: process.env.LINKVERTISE_URL,
    });
  }

  // Bind HWID
  if (!data.hwid) {
    await ref.update({ hwid });
    return res.json({ success: true, message: "Activated" });
  }

  if (data.hwid !== hwid) {
    return res.json({ success: false, message: "HWID mismatch" });
  }

  res.json({ success: true });
});

/* =========================
   Linkvertise callback
========================= */
app.get("/unlock", async (req, res) => {
  // Chỉ đánh dấu đã unlock (logic thật bạn có thể nâng cấp sau)
  const keys = await db.collection("keys").where("unlocked", "==", false).limit(1).get();
  if (!keys.empty) {
    await keys.docs[0].ref.update({ unlocked: true });
  }
  res.send("Unlocked! You can return to the app.");
});

/* =========================
   Static dashboard
========================= */
app.use("/dashboard", express.static(path.join(__dirname, "public")));

/* =========================
   Start server
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
