// Masada kullanılabilecek hazır mesajlar ve emojiler (serbest metin yok).
export const QUICK_MESSAGES = [
  "Hadi ama! ⏳",
  "Çaylar benden ☕",
  "Bravo 👏",
  "Of of 😩",
  "Şansa bak 🍀",
  "Okey kimde? 🤔",
  "Gülme komşuna 😄",
  "İyi oyunlar 🙂",
];
export const QUICK_EMOJIS = ["👍", "😂", "😮", "😡", "🔥", "☕"];

export const BOT_WIN_LINES = ["Bitti! 🎉", "Kusura bakmayın 😄", "Bugün şanslı günümdeyim 🍀", "Çaylar sizden ☕"];
export const BOT_LOSE_LINES = ["Tebrikler 👏", "Of of 😩", "Az kalmıştı!", "Bir dahakine 😤"];

export function isAllowedMessage(text: string) {
  return QUICK_MESSAGES.includes(text) || QUICK_EMOJIS.includes(text);
}
