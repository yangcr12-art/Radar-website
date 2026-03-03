const NAME_OVERRIDES = {
  "A. Boupendza": "A. 布彭扎",
  Cryzan: "克里赞",
  "A. Mitriță": "A. 米特里策",
  Leo: "莱奥",
  "A. Burcă": "A. 布尔克",
  "Mateus Vital": "马特乌斯·维塔尔",
  Riccieli: "里谢利",
  "A. Yakubu": "A. 雅库布",
  Guga: "古加",
  "M. Sarkaria": "M. 萨尔卡里亚",
  "Óscar Melendo": "奥斯卡·梅伦多",
  Serginho: "塞尔吉尼奥",
  "U. Spajić": "U. 斯帕伊奇",
  "O. Omoijuanfo": "O. 奥莫伊胡安弗",
  "V. Qazaishvili": "V. 卡扎伊什维利",
  "André Luis": "安德烈·路易斯",
  "Pedro Henrique": "佩德罗·恩里克",
  "Gustavo Sauer": "古斯塔沃·绍尔",
  "Wilson Manafá": "威尔逊·马纳法",
  "Bruno Nazário": "布鲁诺·纳扎里奥",
  "Wu Lei": "武磊",
};

const TOKEN_MAP = {
  andré: "安德烈",
  alberto: "阿尔韦托",
  alexander: "亚历山大",
  bruno: "布鲁诺",
  cristian: "克里斯蒂安",
  daniel: "丹尼尔",
  davidson: "戴维森",
  edu: "埃杜",
  felipe: "费利佩",
  fernando: "费尔南多",
  gabriel: "加布里埃尔",
  gustavo: "古斯塔沃",
  hector: "埃克托",
  iago: "雅戈",
  joao: "若昂",
  jose: "何塞",
  juan: "胡安",
  leo: "莱奥",
  lucas: "卢卡斯",
  luis: "路易斯",
  mateus: "马特乌斯",
  matheus: "马特乌斯",
  miguel: "米格尔",
  oscar: "奥斯卡",
  pedro: "佩德罗",
  romulo: "罗慕洛",
  sergio: "塞尔吉奥",
  serginho: "塞尔吉尼奥",
  vital: "维塔尔",
  wesley: "韦斯利",
  wilson: "威尔逊",
  yao: "姚",
  yang: "杨",
  zhang: "张",
  zhao: "赵",
  zhu: "朱",
  wang: "王",
  wu: "吴",
  sun: "孙",
  li: "李",
  liu: "刘",
  xu: "徐",
  he: "何",
  hu: "胡",
  lu: "卢",
  guo: "郭",
  chen: "陈",
  zheng: "郑",
  feng: "冯",
  peng: "彭",
};

function normalizeKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function splitTokens(name) {
  return normalizeKey(name)
    .split(/[\s\-·]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function fallbackToken(token) {
  if (/^[A-Z]\.$/.test(token)) return token;
  return token;
}

export function transliteratePlayerName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";

  const normalized = normalizeKey(raw);
  if (NAME_OVERRIDES[raw]) return NAME_OVERRIDES[raw];
  if (NAME_OVERRIDES[normalized]) return NAME_OVERRIDES[normalized];

  const tokens = splitTokens(raw);
  if (tokens.length === 0) return "";

  const mapped = tokens.map((token) => {
    const key = token.toLowerCase();
    return TOKEN_MAP[key] || fallbackToken(token);
  });
  const isInitialToken = (token) => /^[A-Z]\.$/.test(token);
  const unresolvedCount = mapped.filter((value, i) => value === tokens[i] && !isInitialToken(tokens[i])).length;

  // If unresolved tokens remain, keep empty for manual correction.
  if (unresolvedCount > 0) {
    return "";
  }
  return mapped.join("·");
}
