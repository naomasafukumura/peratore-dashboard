// 宿題カードのグルーピング共通ロジック
// homework.html（宿題一覧の表示グルーピング）と practice-v2.html（チャンクキュー構築・再開検証）で共有する。
(function (global) {
  'use strict';

  // グルーピングキーの優先順位: chunkId > _hwSection > section > states[0].label > trigger
  function hwGroupKey(card) {
    if (!card) return '';
    return card.chunkId || card._hwSection || card.section ||
      (card.states && card.states[0] && card.states[0].label) || card.trigger || '';
  }

  function sortCardsById(cardsArr) {
    return cardsArr.slice().sort((a, b) => {
      const aId = parseInt(String(a.id).replace('db-', '')) || 0;
      const bId = parseInt(String(b.id).replace('db-', '')) || 0;
      return aId - bId;
    });
  }

  // カード配列を hwGroupKey でグループ化する（cards_json順=先生の選択順を維持）。
  // 各グループ内は id 昇順に並べ替える。homework.html の宿題一覧表示グルーピングで使用。
  function buildHwGroups(cardsArr) {
    const map = new Map();
    const order = [];
    (cardsArr || []).forEach((c) => {
      const key = hwGroupKey(c);
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key).push(c);
    });
    return order.map((key) => {
      const groupCards = sortCardsById(map.get(key));
      return { key: key, cards: groupCards, firstCard: groupCards[0], count: groupCards.length };
    });
  }

  // 会話チャンク（chunkId あり）のカード列から、チャンク順のID列を計算する。
  // chunkId のないカード（埋め込みカード）はグループ化せず個別に扱う
  // （既存の「chunkIdなし＝埋め込みカード」という判定を維持）。
  // practice-v2.html のキュー構築（$startBtn / lvRangePractice）・宿題再開時の整合性検証で使用。
  function computeChunkOrder(cardsArr) {
    const chunkOrder = [];
    const seen = new Set();
    (cardsArr || []).forEach((c) => {
      if (c.chunkId && !seen.has(c.chunkId)) {
        seen.add(c.chunkId);
        chunkOrder.push(c.chunkId);
      }
    });
    const chunkFirstIds = chunkOrder.map((chunkId) => {
      const group = (cardsArr || []).filter((c) => c.chunkId === chunkId);
      const sorted = sortCardsById(group);
      return String(sorted[0].id).replace('db-', '');
    });
    const embeddedCards = (cardsArr || []).filter((c) => !c.chunkId);
    return { chunkOrder: chunkOrder, chunkFirstIds: chunkFirstIds, embeddedCards: embeddedCards };
  }

  const api = {
    hwGroupKey: hwGroupKey,
    buildHwGroups: buildHwGroups,
    computeChunkOrder: computeChunkOrder
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.HwGrouping = api;
  }
})(typeof window !== 'undefined' ? window : this);
