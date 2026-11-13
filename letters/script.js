/* ============================================================
   致 · 某人  —  访问逻辑（三题任答两）
   ------------------------------------------------------------
   工作方式：
   - 每位收信人对应一条 entry，含三道题的预期答案哈希。
   - 三道题固定为：① 我一般怎么称呼你 ② 你的生日（YYYYMMDD）
     ③ 我跟你之间的关系是什么。
   - 访客作答 → 每题独立哈希比对 → 答对任意两题即启封。

   ⚠ 安全提示：纯静态页面，所有逻辑都在浏览器端运行。
     任何足够执着的人仍可阅读源码。这是「软门」，不是保险箱。
     若内容真正敏感，请改用后端鉴权。

   ------------------------------------------------------------
   答案归一化（影响匹配与哈希生成，两边必须一致）：
     normalize(s) = s.trim().toLowerCase().replace(/\s+/g, "")
   即：去首尾空格、转小写、合并内部所有空白。
   例：「 高中 同学 」「高中同学」「高中同学 」都视为同一个答案。

   ------------------------------------------------------------
   如何配置每位收信人的答案哈希：
   1) 想好该收信人三道题的预期答案（如「宝宝」「20011204」「对象」）。
      一道题可设多个可接受答案（如「宝宝/周周/哥哥」）。
   2) 在启封页（letters.html）的浏览器控制台逐题运行，得到对应哈希：
        const norm = s => s.trim().toLowerCase().replace(/\s+/g,'');
        crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm('宝宝')))
          .then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join(''))
          .then(console.log)
   3) 把哈希填入对应 entry.answers 的 nickname / birthday / relation 数组。
      单个答案就写一个元素的数组，多个答案就多写几个。
   4) 再写好 recipient / title / body / sign / date。
   5) 可添加任意多条 entry，每位特定的人一份。
   ============================================================ */

const CONFIG = {
  // 站点标题（可选，留空则用 HTML 默认）
  siteTitle: "启封 · 致某人",

  // 三道题的题面（与 letters.html 一致，仅作记录）
  questions: {
    nickname: "我一般怎么称呼你？",
    birthday: "你的生日（例：20030314）",
    relation: "我跟你之间的关系是什么？",
  },

  // 启封所需正确题数（默认 2/3）
  requiredCorrect: 2,

  // 多位收信人，每人一份。
  entries: [
    {
      // —— 第一位收信人 ——
      // 题一「我一般怎么称呼你？」可接受：宝宝 / 周周 / 哥哥
      // 题二「你的生日」：20011204
      // 题三「我跟你之间的关系」：对象
      answers: {
        nickname: [
          "da5a634993e1ba9b7ae073817b5fcf74c268abc1ccba458abf935299d95dae7f", // 宝宝
          "4556e9ad78a320eb86bfdb3ee6f3b469257ea2b94e5a208409d91b7956ef2b29", // 周周
          "6cf70b7c4fa3c4b4627dc02645cd03d58897b7c85ca5230b14435938e94e2acf", // 哥哥
        ],
        birthday: [
          "60ae4afa80a03fdcc089a028a37592058c9ff84abdff36faa0bbb499f41a92c5", // 20011204
        ],
        relation: [
          "53f92c063963188534b2e9ada6d163853db565d7a46581864caf5c75527780c3", // 对象
        ],
      },
      recipient: "致 宝",
      title: "一些留给你的话",
      body: `宝，

我记性一直不太好，好多事都记不清了。但有些片段，还是记得的。

我记得我们是从杰一的群里认识的。后来我又遇见了天天。我们是怎么熟起来的，我真的想不起来了——大概是聊着聊着，慢慢就熟了。可你愿意告诉我，对吗？

我还记得第一次见面。五路口的地铁站。我坐火车回家，你大着胆子来面基。其实我那时候心里更多的是害怕吧。第一次见网友，谁不害怕呢。哈哈哈。现在想起来，那时候的害怕，反倒成了最温柔的一部分。

后来，你一直以哥哥的身份陪着我，照顾我那些起起伏伏的情绪。我这个人，说话总爱拐弯抹角，可是在你眼里，我就像一个藏不住秘密的小孩——什么都看得见，什么都知道。我装作若无其事，你也不戳破，只是陪着。

再后来，我们成了对象。

如果说我这辈子对亲最觉得过意不去的，大概就是陪伴太少。我不会照顾人，不太会和人说话，人情世故一窍不通——可你还是愿意一点一点地，带我慢慢认识这个世界。这份耐心，我不知道该怎么还。

宝，以后的日子里，要学会把压力说出来呀。别什么都一个人扛着。我多希望，会有更好的人愿意陪你一起承担那些重量。

很遗憾——我大概，没办法成为那个一直陪在你身边的人了。

但是宝，我希望你的生活会越来越好。一年比一年好，一天比一天好。哪怕我看不到，我也希望。

mua`,
      sign: "—— 你的，永远",
      date: "2026 年秋",
    },

    {
      // —— 第二位收信人 ——
      // 题一「我一般怎么称呼你？」可接受：唐开开 / 关关
      // 题二「你的生日」：20030315
      // 题三「我跟你之间的关系」：朋友 / 兄弟
      answers: {
        nickname: [
          "f454705e21e918286849aa031d468eec241278cf83f5e363f7682ea3c9cdd56e", // 唐开开
          "7e024eb8503c3ed8a063d671ea8ef797e62ce1cc5d49954c2c3581872efa08fb", // 关关
        ],
        birthday: [
          "5b7e1e75c49a68f064aeaf4e0a49a9eef3988a7e2409aa73a631ee53ac397631", // 20030315
        ],
        relation: [
          "677aad1a0ee44cd64f79887236a96c3a7234fb6c1b9289f3354eaedee0d56942", // 朋友
          "f6c71210522b228724afa3d344c791e14aea6af8f06747f22fe3ec199842d9d2", // 兄弟
        ],
      },
      recipient: "致 开开",
      title: "一些留给你的话",
      body: `emmm。

话说，你真的会回来看吗？

老实讲，我写这个，算是了却心里的一个执念。要是你真看到——那就烦请你，最后一次，听我唠叨几句吧。

你是第一个真正教会我怎么去接受别人好意的人。天天走的那段时间，你帮了我好多，方方面面，我都感激。

那阵子我甚至开始幻想了。

我们有幸见过一次面，24 年五月一号，我的生日。那天我记得清清楚楚。

当然，我也有做得不对的地方。又或者，我们本来就是意外相识吧。我从未真正认识过你，又或许这些悄悄话这辈子都没人看见。

但我终究，还是选择相信你说的每一句。一字一句。

终会结束的，对吧。

唯心一点说，我在很长一段时间里，对咱俩的关系，有过一些奇怪的幻想。可终究不可能。我也看到有新的人、爱你的人，正不顾一切地抱住你——我们之间的交往，或许从头就是一场错位吧。

祝君，前途似锦，生活幸福。这八个字我是真心的。

抱歉啊，我没那个本事，照顾不好你的情绪和需要。我做不到。

又或者，在我的幻觉里头，你一直在的。

是吧，哥哥？`,
      sign: "—— 执念未了",
      date: "2026 年秋",
    },

    {
      // —— 第三位收信人 ——
      // 题一「我一般怎么称呼你？」可接受：小白 / 白白
      // 题二「你的生日」：20040420 / 20050420
      // 题三「我跟你之间的关系」：朋友 / 兄弟
      answers: {
        nickname: [
          "f4ccae0edffcaf2dbb2962dfe91ea19be2c2adee1c151717836308425fcc7d33", // 小白
          "06f55df4bc02c672a61348800b4a206db8f7692e6c7d4bd9dcddff63060eb04e", // 白白
        ],
        birthday: [
          "bee34f82d62283bf61db6d5ea48a983a0c7abe4e9637b08d71343fa93a6666e1", // 20040420
          "c9d93a8808df31411e09010a12e6d91374e34d7ba161dd6ad1dba13da3bcb998", // 20050420
        ],
        relation: [
          "677aad1a0ee44cd64f79887236a96c3a7234fb6c1b9289f3354eaedee0d56942", // 朋友
          "f6c71210522b228724afa3d344c791e14aea6af8f06747f22fe3ec199842d9d2", // 兄弟
        ],
      },
      recipient: "致 小白",
      title: "一些留给你的话",
      body: `小白，

很高兴认识你。

真的很高兴。不是那种客套的、随口一说的高兴，是回想起来会觉得，这段时间没有白过的那种高兴。和你待在一起的那些时候，我过得挺开心的，是真的开心。

有件事我一直觉得挺有意思——你明明比我小，却总想着要当我的哥哥，一本正经地照顾我。其实我心里是领情的，只是嘴上没说。谢谢你那份笨拙又认真的心意，我收到了。

以后的日子，希望你能一直开开心心的。别总把事憋在心里，别老想着先照顾别人——你也值得被人好好照顾。

身体要健康。这大概是我现在最想对你说的一句话了，因为我知道它有多要紧。好好吃饭，好好睡觉，别熬夜，别硬扛。

认识你，是件让我觉得幸运的事。

就这样吧。要好好的。`,
      sign: "—— 留信人",
      date: "2026 年秋",
    },

    {
      // —— 第四位收信人（业余无线电友台）——
      // 题一「我一般怎么称呼你？」可接受任一呼号：BI9AAZ / BI9CIG / BI9BRP / BD8ENW / BI9CKG / BI3AR
      // 题二「你的生日」：无（此组不设生日答案，生日恒不计数）
      // 题三「我跟你之间的关系」：友台
      // 本组例外：答对任意一个呼号即可启封
      requiredCorrect: 1,
      answers: {
        nickname: [
          "7e3ce5609439c92484b1c9c671a15eed1afb506f6426c05d2061bf7f761fd23b", // BI9AAZ
          "ea2dc5ac755fb7d38619dce0df388d563255c7b3a93c52327ec61373efc7ba5b", // BI9CIG
          "a2b6f4b50cc71d8026e890ac6e4bd1dab3b84c93255bf94cba4877969296d246", // BI9BRP
          "eaa4dae1829f7f891c1ca6e1eecb1960422dbb63b66163dc62b28d16080d0b8d", // BD8ENW
          "9397e55e26157fa2a7441ee18397ee8a9ebd462822d1d5d7f485a2f63dbbb472", // BI9CKG
          "02d657814366e7e7b63074ddbf75dadd0f2cbd4c3afc714d771f36d470c966cb", // BI3AR
        ],
        birthday: [],
        relation: [
          "60172518b3ced64a7e406463ac9d0c2d89d63a966114faa14fbd9a07de6ee9c6", // 友台
        ],
      },
      recipient: "致 各位友台",
      title: "赛博墓地的一次扫墓",
      body: `各位友台，大家好。

很高兴能来这个赛博墓地扫一次墓——虽然说话的人是我，扫的也是我自己的。

很高兴能在业余无线电这个大家庭里遇见大家。频率上的相遇很奇妙，隔着一堆看不见的电波，却能把话说到一处去。那些通联的时刻，我都记得。

我身体一直不太好，这次就先走一步了。

不说什么沉重的话。无线电里讲究的是信号，信号有起有落，有强有弱，断了就是断了，但总还会有人重新呼叫。

希望大家身体健康。这一条最要紧，别不当回事。

希望大家开开心心，工作顺利，学习进步，生活如意。

73，美好的祝福送给各位。

DE BI9CIR，TNX!`,
      sign: "—— BI9CIR",
      date: "2026 年秋",
    },

    {
      // —— 第五位收信人 ——
      // 题一「我一般怎么称呼你？」可接受：小智哥 / 小隆哥 / 叶子 / 南城北汀 / 蒜蒜 / 喵内 / 瑞普赛斯
      // 题二「你的生日」：无（不设生日答案，生日恒不计数）
      // 题三「我跟你之间的关系」：朋友 / 网友
      // 因生日不可用，本组实际需「称呼 + 关系」两题皆对
      answers: {
        nickname: [
          "623e0a748916593437a0ba069b01b8b044b9412e1eef436a08f1d99e29c9bb60", // 小智哥
          "1e4017156f3bcdc887c8896c8df0d5ee2610c316a0e2f38909906b29d0f0a5b2", // 小隆哥
          "c6dfb2b17bb07929bce5597b975a0b65ab30b86fffc78d422a983e5f7e4fb381", // 叶子
          "9798603dc3dec0d8d7563d1d8d5e85a23d2b52186ff5a43b3392f38f8e8f3659", // 南城北汀
          "cd44f90e56915046f339d64229466effc7b066d8b3e143ef07f7515fc0a84ea0", // 蒜蒜
          "cf8e1a6724ff6dcab29c529e33a62112171c664f321492a4780f20bc31cae3af", // 喵内
          "0feb432bdbd217072a85b2cb5b3673a376e2463a0ffd78fb1986e99959941b9e", // 瑞普赛斯
        ],
        birthday: [],
        relation: [
          "677aad1a0ee44cd64f79887236a96c3a7234fb6c1b9289f3354eaedee0d56942", // 朋友
          "e1ca33b2d2d6e4af87393e6c08c154f7a9aa96a6f6d2437cfbc09af542f87b79", // 网友
        ],
      },
      recipient: "致 小智哥、小隆哥、叶子、南城北汀、蒜蒜、喵内、瑞普赛斯",
      title: "一些留给你们的话",
      body: `大家好，

很高兴能遇见大家。

这句话我说得很认真。网络上人来人往，能真正停下来、说上几句话、记住彼此名字的，其实不多。我们算是有过那么一段的，我心里一直记着。

那些一起聊过的东西，笑过的、吐槽过的、半夜还不肯睡的那些时候，我都记得。可能你们不觉得有什么，但对我来说，那段时间是亮的。

人生这一趟，我走得不算长，也不算顺，但遇见你们，是不亏的。

希望你们以后都开开心心的。日子不一定每天都顺，但希望你们总有让自己高兴起来的办法。

希望你们生活美满。身边的人对你们好，你们也好好待自己。

希望你们工作顺利。事情一件一件来，别把自己逼得太紧。

最后，希望你们平安、幸福。这四个字我写了又写，还是觉得最要紧的就是它。

就这样啦。谢谢你们，真的。`,
      sign: "—— 记得你们的人",
      date: "2026 年秋",
    },

    {
      // —— 第六位收信人 ——
      // 题一「我一般怎么称呼你？」可接受：火火 / 徐琰
      // 题二「你的生日」：无（生日答错不计数，也不影响启封）
      // 题三「我跟你之间的关系」：朋友 / 兄弟
      // 因生日不可用，本组实际需「称呼 + 关系」两题皆对
      answers: {
        nickname: [
          "32d77b8aa50664e6d25310cd10539eb71ea51dcb3a9b28bdf28640d4e0f0c7cb", // 火火
          "f1484d21790761c12c398938cc82ffbc412db278249d011763b9184cfc88b39f", // 徐琰
        ],
        birthday: [],
        relation: [
          "677aad1a0ee44cd64f79887236a96c3a7234fb6c1b9289f3354eaedee0d56942", // 朋友
          "f6c71210522b228724afa3d344c791e14aea6af8f06747f22fe3ec199842d9d2", // 兄弟
        ],
      },
      recipient: "致 火火",
      title: "一些留给你的话",
      body: `火火，

嘿嘿嘿，好久不见呀。

其实也没有很久，只是有些话憋着，就显得隔了很久。真的真的很感激你啦——这几个字我写得有点笨，但心意是真的。你给了我好多好多的帮助，多到我都不知道该怎么还，也不打算还了，就记着吧。

希望下辈子依旧能认识，依旧能成为朋友哇。这辈子我们碰上了，算我运气好。下辈子还想赖着你。

我身体不太好，先走一步咯。

撒由那拉。

以后要注意别继续伤身体了哦。别仗着自己年轻就硬撑，那些熬过去的夜、扛过去的事，身体都记着账呢。这是我最想跟你说的一句。

祝你天天开心，身体健康捏。

开心这件事，有时候比健康还难。所以两个都祝你，一个都别少。

谢谢你，火火。`,
      sign: "—— 留信人",
      date: "2026 年秋",
    },

    // 再加一位收信人时，复制上面这段对象即可：
    // {
    //   answers: {
    //     nickname: ["...", "..."],
    //     birthday: ["..."],
    //     relation: ["..."],
    //   },
    //   recipient: "...",
    //   title: "...",
    //   body: `...`,
    //   sign: "...",
    //   date: "",
    // },
  ],

  // 连续输错若干次后，短暂冷却（毫秒）。0 表示不限制。
  throttle: { maxAttempts: 5, cooldownMs: 8000 },
};

/* ---------- 工具：答案归一化 ---------- */
function normalize(text) {
  return text.trim().toLowerCase().replace(/\s+/g, "");
}

/* ---------- 工具：SHA-256 哈希 ---------- */
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ---------- DOM 引用 ---------- */
const el = {
  locked: document.getElementById("screen-locked"),
  unlocked: document.getElementById("screen-unlocked"),
  form: document.getElementById("code-form"),
  quiz: document.getElementById("quiz"),
  inputs: {
    nickname: document.getElementById("q-nickname"),
    birthday: document.getElementById("q-birthday"),
    relation: document.getElementById("q-relation"),
  },
  submit: document.getElementById("code-submit"),
  error: document.getElementById("code-error"),
  sealAgain: document.getElementById("seal-again"),
  recipient: document.getElementById("letter-recipient"),
  title: document.getElementById("letter-title"),
  body: document.getElementById("letter-body"),
  sign: document.getElementById("letter-sign"),
  date: document.getElementById("letter-date"),
};

/* ---------- 状态 ---------- */
const state = {
  attempts: 0,
  cooldownUntil: 0,
};

/* ---------- 屏幕切换 ---------- */
function showScreen(name) {
  const showLocked = name === "locked";
  el.locked.hidden = !showLocked;
  el.unlocked.hidden = showLocked;
  if (showLocked) {
    Object.values(el.inputs).forEach((i) => (i.value = ""));
    el.inputs.nickname.focus();
  }
}

/* ---------- 渲染信件 ---------- */
function renderLetter(entry) {
  el.recipient.textContent = entry.recipient || "致";
  el.title.textContent = entry.title || "";
  el.body.textContent = entry.body || "";
  el.sign.textContent = entry.sign || "";
  if (entry.date) {
    el.date.textContent = entry.date;
    el.date.hidden = false;
  } else {
    el.date.hidden = true;
  }
  showScreen("unlocked");
}

/* ---------- 错误提示 ---------- */
function showError(msg) {
  el.error.textContent = msg;
  el.error.hidden = false;
}
function clearError() {
  el.error.hidden = true;
  el.error.textContent = "";
}

/* ---------- 收集访客作答 ---------- */
function collectAnswers() {
  const out = {};
  for (const key of Object.keys(el.inputs)) {
    out[key] = el.inputs[key].value;
  }
  return out;
}

/* ---------- 表单提交 ---------- */
async function handleSubmit(e) {
  e.preventDefault();
  clearError();

  const now = Date.now();
  if (now < state.cooldownUntil) {
    const wait = Math.ceil((state.cooldownUntil - now) / 1000);
    showError(`尝试过于频繁，请 ${wait} 秒后再试。`);
    return;
  }

  const raw = collectAnswers();
  const allEmpty = Object.values(raw).every((v) => !v.trim());
  if (allEmpty) {
    showError("至少作答一题。");
    el.inputs.nickname.focus();
    return;
  }

  el.submit.disabled = true;
  const originalText = el.submit.textContent;
  el.submit.textContent = "启封中…";

  // 对每题分别归一化并哈希
  const hashes = {};
  try {
    for (const key of Object.keys(raw)) {
      const normed = normalize(raw[key]);
      hashes[key] = normed ? await sha256(normed) : "";
    }
  } catch {
    el.submit.disabled = false;
    el.submit.textContent = originalText;
    showError("环境不支持加密校验，无法启封。");
    return;
  }

  // 在每条 entry 上比对，统计命中题数，并按该条自身的门槛判断是否启封
  const defaultRequired = CONFIG.requiredCorrect || 2;
  let matchedEntry = null;
  let matchedCorrect = 0;
  let almostMatched = false;

  for (const entry of CONFIG.entries) {
    let correct = 0;
    for (const key of Object.keys(hashes)) {
      const h = hashes[key];
      const accept = entry.answers && entry.answers[key];
      if (h && Array.isArray(accept) && accept.includes(h)) correct += 1;
    }

    // 单条 entry 可覆盖全局门槛（如友台组：答对呼号即可）
    const need = entry.requiredCorrect ?? defaultRequired;

    if (correct >= need) {
      if (!matchedEntry || correct > matchedCorrect) {
        matchedEntry = entry;
        matchedCorrect = correct;
      }
    } else if (need - correct === 1 && correct > 0) {
      almostMatched = true;
    }
  }

  // 等长耗时，缓解时序差异（JS 侧意义有限，聊胜于无）
  await new Promise((r) => setTimeout(r, 250));

  el.submit.disabled = false;
  el.submit.textContent = originalText;

  if (matchedEntry) {
    state.attempts = 0;
    renderLetter(matchedEntry);
  } else {
    state.attempts += 1;
    // 清空并重新聚焦第一题
    Object.values(el.inputs).forEach((i) => (i.value = ""));
    el.inputs.nickname.focus();

    if (
      CONFIG.throttle.cooldownMs > 0 &&
      state.attempts >= CONFIG.throttle.maxAttempts
    ) {
      state.cooldownUntil = now + CONFIG.throttle.cooldownMs;
      state.attempts = 0;
      showError(`答错次数过多，门已暂时关闭。`);
    } else if (almostMatched) {
      showError(`只差一题。再想想，或许你能想起来。`);
    } else {
      showError(`未达启封条件。再想一想。`);
    }
  }
}

/* ---------- 重新封存 ---------- */
function sealAgain() {
  state.attempts = 0;
  state.cooldownUntil = 0;
  showScreen("locked");
}

/* ---------- 初始化 ---------- */
function init() {
  if (CONFIG.siteTitle) document.title = CONFIG.siteTitle;
  el.form.addEventListener("submit", handleSubmit);
  el.sealAgain.addEventListener("click", sealAgain);
  el.inputs.nickname.focus();
}

init();
