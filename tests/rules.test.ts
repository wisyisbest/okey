import { describe, expect, it } from "vitest";
import { advance, createRoom, discardTile, drawTile, finishHand, GameError, joinRoom, startGame } from "../src/lib/okey/game";
import { arrangeGroups, checkWin } from "../src/lib/okey/rules";
import { Face, okeyOf } from "../src/lib/okey/tiles";

// Yardımcı: renk (0-3) ve sayıdan taş id'si; copy=1 ikinci takım
const t = (color: number, num: number, copy = 0) => copy * 52 + color * 13 + num - 1;
const FAKE = 104;
// Okey: kırmızı 5 (gösterge kırmızı 4)
const okey: Face = { color: 0, num: 5 };
const J = t(0, 5);
const J2 = t(0, 5, 1);

describe("okeyOf", () => {
  it("göstergenin bir üstü", () => {
    expect(okeyOf(t(2, 7))).toEqual({ color: 2, num: 8 });
    expect(okeyOf(t(1, 13))).toEqual({ color: 1, num: 1 });
  });
});

describe("checkWin", () => {
  it("seri ve gruplar", () => {
    const hand = [
      t(1, 1), t(1, 2), t(1, 3), t(1, 4), // siyah 1-4
      t(2, 9), t(2, 10), t(2, 11), // mavi 9-11
      t(0, 7), t(1, 7), t(3, 7), // 7'ler
      t(3, 11), t(3, 12), t(3, 13), t(3, 1), // sarı 11-12-13-1
    ];
    expect(checkWin(hand, okey)).toBe("groups");
  });

  it("13-1-2 geçersiz", () => {
    const hand = [
      t(3, 13), t(3, 1), t(3, 2),
      t(1, 1), t(1, 2), t(1, 3), t(1, 4),
      t(2, 9), t(2, 10), t(2, 11),
      t(0, 7), t(1, 7), t(3, 7), t(2, 7),
    ];
    expect(checkWin(hand, okey)).toBeNull();
  });

  it("okey joker olarak eksik taşın yerine geçer", () => {
    const hand = [
      t(1, 1), J, t(1, 3), t(1, 4),
      t(2, 9), t(2, 10), J2,
      t(0, 7), t(1, 7), t(3, 7),
      t(3, 11), t(3, 12), t(3, 13), t(3, 1),
    ];
    expect(checkWin(hand, okey)).toBe("groups");
  });

  it("sahte okey okeyin değerini alır", () => {
    // Sahte okey = kırmızı 5 → kırmızı 3-4-5
    const hand = [
      t(0, 3), t(0, 4), FAKE,
      t(1, 1), t(1, 2), t(1, 3), t(1, 4),
      t(2, 9), t(2, 10), t(2, 11),
      t(0, 7), t(1, 7), t(3, 7), t(2, 7),
    ];
    expect(checkWin(hand, okey)).toBe("groups");
  });

  it("aynı renk iki taş grup olmaz", () => {
    const hand = [
      t(0, 7), t(0, 7, 1), t(1, 7),
      t(1, 1), t(1, 2), t(1, 3), t(1, 4),
      t(2, 9), t(2, 10), t(2, 11),
      t(3, 1), t(3, 2), t(3, 3), t(3, 4),
    ];
    expect(checkWin(hand, okey)).toBeNull();
  });

  it("yedi çift", () => {
    const hand = [
      t(0, 1), t(0, 1, 1), t(1, 3), t(1, 3, 1), t(2, 9), t(2, 9, 1),
      t(3, 13), t(3, 13, 1), t(1, 8), t(1, 8, 1), t(0, 11), t(0, 11, 1), t(2, 2), J,
    ];
    expect(checkWin(hand, okey)).toBe("pairs");
  });

  it("dağınık el bitmez", () => {
    const hand = [
      t(0, 1), t(0, 3), t(1, 6), t(1, 9), t(2, 2), t(2, 12), t(3, 4),
      t(3, 8), t(0, 10), t(1, 13), t(2, 6), t(3, 11), t(0, 13), t(1, 2),
    ];
    expect(checkWin(hand, okey)).toBeNull();
  });
});

describe("arrangeGroups", () => {
  it("perleri bulur", () => {
    const hand = [t(1, 1), t(1, 2), t(1, 3), t(0, 7), t(1, 7), t(3, 7), t(2, 12)];
    const r = arrangeGroups(hand, okey);
    expect(r.groups.flat().length).toBe(6);
    expect(r.rest).toEqual([t(2, 12)]);
  });
});

describe("oyun akışı", () => {
  it("botlarla bir el sonuna kadar oynanır", () => {
    let seed = 42;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const s = createRoom("1234", "Ali", "tok", 0);
    joinRoom(s, "Veli", "tok2", 0);
    startGame(s, 0, 0, rng);
    expect(s.seats.every(Boolean)).toBe(true);
    expect(s.hands[0].length).toBe(15);
    expect(s.hands[1].length).toBe(14);
    expect(s.deck.length).toBe(106 - 1 - 57);

    // Herkesi bot yap ki sona kadar otomatik oynasın
    for (const p of s.seats) p!.isBot = true;
    let now = 0;
    for (let i = 0; i < 500 && s.phase === "playing"; i++) {
      now += 2000;
      advance(s, now);
    }
    expect(s.phase).toBe("ended");
    const all = [...s.hands.flat(), ...s.discards.flat(), ...s.deck, s.indicator];
    if (s.winTile !== null) all.push(s.winTile);
    expect(new Set(all).size).toBe(106);
  });

  it("sıra kontrolü ve hatalı bitirme", () => {
    const s = createRoom("1", "A", "a", 0);
    startGame(s, 0, 0);
    expect(() => drawTile(s, 1, "deck")).toThrow(GameError);
    expect(() => drawTile(s, 0, "deck")).toThrow("Zaten");
    const tile = s.hands[0][0];
    if (!checkWin(s.hands[0].slice(1), okeyOf(s.indicator))) {
      expect(() => finishHand(s, 0, tile)).toThrow("bitmiyor");
    }
    discardTile(s, 0, tile, 1);
    expect(s.turn).toBe(1);
    expect(s.discards[0]).toEqual([tile]);
  });
});
