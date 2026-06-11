// ============================================================
//  LoveMatch Pro — Google Apps Script (Telegram Webhook Bot)
//  Converted from Python (python-telegram-bot + SQLite)
//  Database: Google Sheets (ganti SHEET_ID dengan ID spreadsheet kamu)
// ============================================================

// ─── KONFIGURASI ────────────────────────────────────────────
const TOKEN     = "ISI_TOKEN_BOT_KAMU";
const SHEET_ID  = "ISI_SPREADSHEET_ID_KAMU";
const BASE_URL  = `https://api.telegram.org/bot${TOKEN}`;

// ─── SHEET HELPER ───────────────────────────────────────────
// Nama tab sheet harus sama persis: users | likes | seen | matches | photos | filters

function getSheet(name) {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
}

// Ambil semua data sheet sebagai array of objects (row 1 = header)
function getAllRows(sheetName) {
  const sheet = getSheet(sheetName);
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

// Tambah satu baris
function appendRow(sheetName, rowObj) {
  const sheet   = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row     = headers.map(h => rowObj[h] !== undefined ? rowObj[h] : "");
  sheet.appendRow(row);
}

// Hapus baris berdasarkan kondisi (fn menerima row object, return true = hapus)
function deleteRows(sheetName, conditionFn) {
  const sheet = getSheet(sheetName);
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  const headers = data[0];
  // Iterasi dari bawah agar index tidak bergeser
  for (let i = data.length - 1; i >= 1; i--) {
    const obj = {};
    headers.forEach((h, j) => obj[h] = data[i][j]);
    if (conditionFn(obj)) sheet.deleteRow(i + 1);
  }
}

// Cek apakah baris dengan kondisi tertentu ada
function rowExists(sheetName, conditionFn) {
  return getAllRows(sheetName).some(conditionFn);
}

// ─── TELEGRAM API HELPERS ───────────────────────────────────

function sendMessage(chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text: text, parse_mode: "Markdown" };
  if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
  callTelegram("sendMessage", payload);
}

function sendPhoto(chatId, fileId, caption, replyMarkup) {
  const payload = { chat_id: chatId, photo: fileId, caption: caption };
  if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
  callTelegram("sendPhoto", payload);
}

function editMessageText(chatId, messageId, text) {
  callTelegram("editMessageText", {
    chat_id: chatId, message_id: messageId, text: text
  });
}

function answerCallbackQuery(callbackQueryId) {
  callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId });
}

function callTelegram(method, payload) {
  UrlFetchApp.fetch(`${BASE_URL}/${method}`, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// ─── WEBHOOK ENTRY POINT ────────────────────────────────────

function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);

    if (update.callback_query) {
      handleCallbackQuery(update.callback_query);
      return;
    }

    const msg    = update.message;
    if (!msg) return;

    const userId = msg.from.id;
    const text   = msg.text || "";

    // Foto
    if (msg.photo) {
      handlePhoto(userId, msg.photo);
      return;
    }

    // Command
    if (text.startsWith("/start"))   { handleStart(userId);   return; }
    if (text.startsWith("/profile")) { handleProfile(userId); return; }
    if (text.startsWith("/find"))    { handleFind(userId);    return; }
    if (text.startsWith("/filter"))  { handleFilter(userId);  return; }

    // Smart text handler (sama seperti Python)
    handleText(userId, text, msg);

  } catch (err) {
    Logger.log("Error doPost: " + err);
  }
}

// ─── /start ─────────────────────────────────────────────────

function handleStart(userId) {
  sendMessage(userId,
    "💘 *LoveMatch Pro*\n\nBuat profil, upload foto, dan mulai matching 🔥\n\n" +
    "Perintah:\n/profile - Buat profil\n/find - Cari pasangan\n/filter - Set filter usia"
  );
}

// ─── /profile ───────────────────────────────────────────────

function handleProfile(userId) {
  sendMessage(userId, "Kirim: Nama, Usia, Bio\nContoh: `Budi, 24, Suka kopi dan hiking`");
}

function saveProfile(userId, text) {
  const parts = text.split(",");
  if (parts.length < 3) {
    sendMessage(userId, "❌ Format: Nama, Usia, Bio");
    return;
  }
  const name = parts[0].trim();
  const age  = parseInt(parts[1].trim());
  const bio  = parts.slice(2).join(",").trim();

  if (isNaN(age)) {
    sendMessage(userId, "❌ Usia harus angka. Format: Nama, Usia, Bio");
    return;
  }

  // INSERT OR REPLACE
  deleteRows("users", r => r.user_id == userId);
  appendRow("users", { user_id: userId, name, age, bio });
  sendMessage(userId, "✅ Profil tersimpan!");
}

// ─── Foto ────────────────────────────────────────────────────

function handlePhoto(userId, photos) {
  // Ambil resolusi tertinggi (elemen terakhir)
  const fileId = photos[photos.length - 1].file_id;
  deleteRows("photos", r => r.user_id == userId);
  appendRow("photos", { user_id: userId, file_id: fileId });
  sendMessage(userId, "📸 Foto tersimpan!");
}

// ─── /filter ────────────────────────────────────────────────

function handleFilter(userId) {
  sendMessage(userId, "Kirim rentang usia:\nContoh: `18-30`");
}

function saveFilter(userId, text) {
  const parts = text.split("-");
  const min   = parseInt(parts[0]);
  const max   = parseInt(parts[1]);

  if (isNaN(min) || isNaN(max)) {
    sendMessage(userId, "❌ Format: 18-30");
    return;
  }

  deleteRows("filters", r => r.user_id == userId);
  appendRow("filters", { user_id: userId, min_age: min, max_age: max });
  sendMessage(userId, "✅ Filter tersimpan!");
}

// ─── /find ───────────────────────────────────────────────────

function handleFind(userId) {
  // Ambil filter
  const filterRows = getAllRows("filters").filter(r => r.user_id == userId);
  const filter     = filterRows.length ? filterRows[0] : null;

  // Ambil daftar yang sudah dilihat
  const seenIds = getAllRows("seen")
    .filter(r => r.viewer == userId)
    .map(r => r.seen_user);

  // Ambil semua user kecuali diri sendiri dan yang sudah dilihat
  let candidates = getAllRows("users").filter(u => {
    if (u.user_id == userId) return false;
    if (seenIds.includes(u.user_id)) return false;
    if (filter) {
      const age = parseInt(u.age);
      if (age < filter.min_age || age > filter.max_age) return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    sendMessage(userId, "😢 Tidak ada user lain untuk saat ini");
    return;
  }

  // Pilih acak
  const target = candidates[Math.floor(Math.random() * candidates.length)];

  // Tandai sudah dilihat
  appendRow("seen", { viewer: userId, seen_user: target.user_id });

  // Ambil foto
  const photoRows = getAllRows("photos").filter(r => r.user_id == target.user_id);
  const photo     = photoRows.length ? photoRows[0] : null;

  const keyboard = {
    inline_keyboard: [[
      { text: "❤️ Like", callback_data: `like_${target.user_id}` },
      { text: "❌ Skip", callback_data: "skip" }
    ]]
  };

  const caption = `*${target.name}*, ${target.age}\n\n${target.bio}`;

  if (photo) {
    sendPhoto(userId, photo.file_id, caption, keyboard);
  } else {
    sendMessage(userId, caption, keyboard);
  }
}

// ─── CALLBACK QUERY (Like / Skip) ───────────────────────────

function handleCallbackQuery(query) {
  const userId    = query.from.id;
  const chatId    = query.message.chat.id;
  const messageId = query.message.message_id;
  const data      = query.data;

  answerCallbackQuery(query.id);

  if (data.startsWith("like_")) {
    const likedId = parseInt(data.split("_")[1]);

    appendRow("likes", { liker: userId, liked: likedId });

    // Cek mutual like
    const isMutual = rowExists("likes", r => r.liker == likedId && r.liked == userId);

    if (isMutual) {
      editMessageText(chatId, messageId, "🎉 IT'S A MATCH! ❤️");
      appendRow("matches", { user1: userId, user2: likedId });
      sendMessage(likedId, "🎉 Kamu dapat match baru! Mulai mengobrol!");
    } else {
      editMessageText(chatId, messageId, "❤️ Di-Like!");
    }
  } else {
    editMessageText(chatId, messageId, "❌ Dilewati");
  }

  // Lanjut tampilkan user berikutnya
  handleFind(userId);
}

// ─── CHAT ANTAR MATCH ────────────────────────────────────────

function handleChat(userId, text) {
  const matches = getAllRows("matches").filter(
    r => r.user1 == userId || r.user2 == userId
  );

  if (matches.length === 0) {
    sendMessage(userId, "💬 Kamu belum punya match. Gunakan /find dulu!");
    return;
  }

  matches.forEach(m => {
    const partnerId = m.user1 == userId ? m.user2 : m.user1;
    try {
      sendMessage(partnerId, `💬 ${text}`);
    } catch (err) {
      Logger.log("Gagal kirim ke " + partnerId + ": " + err);
    }
  });
}

// ─── SMART TEXT HANDLER ──────────────────────────────────────
// Logika sama persis dengan Python: cek koma → profil, cek strip+digit → filter, selainnya → chat

function handleText(userId, text, msg) {
  if (text.includes(",")) {
    saveProfile(userId, text);
  } else if (text.includes("-") && text.replace(/-/g, "").match(/^\d+$/)) {
    saveFilter(userId, text);
  } else {
    handleChat(userId, text);
  }
}

// ─── SETUP WEBHOOK ───────────────────────────────────────────
// Jalankan fungsi ini SEKALI dari menu Run setelah deploy Web App

function setWebhook() {
  const webAppUrl = "https://script.google.com/macros/s/DEPLOYMENT_ID_KAMU/exec";
  const url       = `${BASE_URL}/setWebhook?url=${encodeURIComponent(webAppUrl)}`;
  const response  = UrlFetchApp.fetch(url);
  Logger.log(response.getContentText());
}

// ─── SETUP SHEET (jalankan sekali) ───────────────────────────
// Membuat semua tab sheet beserta headernya secara otomatis

function setupSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const schemas = {
    users:   ["user_id", "name", "age", "bio"],
    likes:   ["liker", "liked"],
    seen:    ["viewer", "seen_user"],
    matches: ["user1", "user2"],
    photos:  ["user_id", "file_id"],
    filters: ["user_id", "min_age", "max_age"]
  };

  Object.entries(schemas).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(headers);
      Logger.log(`Sheet "${name}" dibuat`);
    } else {
      Logger.log(`Sheet "${name}" sudah ada`);
    }
  });
}
