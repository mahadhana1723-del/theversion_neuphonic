// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const passport = require("passport");
const session = require("express-session");
require("dotenv").config();

const app = express();
app.use(express.json());

// ✅ Allowed origins
const allowedOrigins = [
  "http://localhost:5000",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:5501", // <-- add this line
  "https://mahadhana1723-del.github.io",
  "https://c6d0d63b7acd.ngrok-free.app"
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS not allowed from this origin"), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ Mongo error:", err));

const SECRET = process.env.JWT_SECRET;

// ✅ User Schema (extended for OAuth)
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  oauthId: String,
  provider: String
});
const User = mongoose.model("User", userSchema);

// ✅ Local Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ msg: "Missing fields" });

    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ msg: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashed, provider: "local" });
    await user.save();

    res.json({ msg: "Account created successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
});

// ✅ Local Signin
app.post("/api/signin", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, provider: "local" });
    if (!user) return res.status(400).json({ msg: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ msg: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, username: user.username }, SECRET, { expiresIn: "1h" });
    res.json({ msg: "Login successful", token, user: { username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ msg: "Server error", error: err.message });
  }
});

// ✅ Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ msg: "No token provided" });
  const token = authHeader.split(" ")[1];
  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ msg: "Invalid token" });
    req.user = decoded;
    next();
  });
}

// ✅ Profile
app.get("/api/profile", authMiddleware, (req, res) => {
  res.json({ msg: "Welcome back!", user: req.user });
});

// ------------------- OAUTH -------------------
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;

app.use(session({ secret: "keyboardcat", resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ oauthId: profile.id, provider: "google" });
    if (!user) {
      user = await User.create({
        username: profile.displayName,
        email: profile.emails?.[0]?.value,
        oauthId: profile.id,
        provider: "google"
      });
    }
    done(null, user);
  } catch (err) {
    done(err, null);
  }
}));

// Facebook Strategy
passport.use(new FacebookStrategy({
  clientID: process.env.FB_CLIENT_ID,
  clientSecret: process.env.FB_CLIENT_SECRET,
  callbackURL: "/api/auth/facebook/callback",
  profileFields: ["id", "displayName", "emails"]
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ oauthId: profile.id, provider: "facebook" });
    if (!user) {
      user = await User.create({
        username: profile.displayName,
        email: profile.emails?.[0]?.value,
        oauthId: profile.id,
        provider: "facebook"
      });
    }
    done(null, user);
  } catch (err) {
    done(err, null);
  }
}));

// OAuth routes
app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/api/auth/google/callback", passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    const token = jwt.sign({ id: req.user._id, username: req.user.username }, SECRET, { expiresIn: "7d" });
    res.redirect(`${process.env.CLIENT_URL}?token=${token}`);
  }
);

app.get("/api/auth/facebook", passport.authenticate("facebook", { scope: ["email"] }));
app.get("/api/auth/facebook/callback", passport.authenticate("facebook", { failureRedirect: "/" }),
  (req, res) => {
    const token = jwt.sign({ id: req.user._id, username: req.user.username }, SECRET, { expiresIn: "7d" });
    res.redirect(`${process.env.CLIENT_URL}?token=${token}`);
  }
);

app.get("/api/test", (req, res) => {
  res.json({ message: "API working fine ✅" });
});


// ------------------- END OAUTH -------------------

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
