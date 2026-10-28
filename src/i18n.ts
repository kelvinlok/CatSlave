export type Language = 'yue-Hant' | 'en';
const storageKey = 'catslave-language';
let language: Language = 'yue-Hant';
try { if (localStorage.getItem(storageKey) === 'en') language = 'en'; } catch { /* Private browsing can block storage. */ }

export function getLanguage() { return language; }
export function gameTitle() { return language === 'en' ? 'CatSlave' : '貓奴'; }
export function setLanguage(next: Language) {
  language = next;
  try { localStorage.setItem(storageKey, next); } catch { /* Switching still works for this session. */ }
}
export function languageLabel() { return language === 'yue-Hant' ? 'English' : '廣東話'; }

// Translate at the presentation boundary so existing game state and saved cats
// remain language-independent, and a paused game can switch immediately.
const cantonese: Record<string, string> = {
  'Play  →': '開始玩  →', 'Practice': '練習', 'Free play →': '自由玩 →',
  'Sound: on': '聲音：開', 'Sound: soft': '聲音：細聲', 'Sound: off': '聲音：關',
  'Rotate to portrait': '請將手機打直', 'Getting the cats ready…': '貓貓準備緊…',
  'This room needs WebGL 2.': '呢間貓屋需要 WebGL 2。',
  'Try a browser with hardware acceleration enabled.': '請用已開啟硬件加速嘅瀏覽器。',
  'BONUS · BUTT PATS': '獎勵關 · 拍屁屁', 'Pause bonus round': '暫停獎勵關',
  'Tap every cat’s butt.': '拍拍每隻貓嘅屁屁。',
  'Pat each cat at least once every 3 seconds.': '每 3 秒最少拍一次每隻貓嘅屁屁。',
  'Last 10 seconds to win +1 upgrade.': '撐夠 10 秒，就多一次升級機會。',
  'Ready': '準備好', 'Get ready': '準備喇', '+1 upgrade': '+1 次升級', 'Bonus over': '獎勵關完咗',
  'Adopt  →': '領養  →', 'PAWDICURE': '貓貓修甲', 'MINI-GAME PRACTICE': '小遊戲練習',
  'PERFECT-STAGE BONUS': '完美過關獎勵', 'SECONDS': '秒', 'Choose your cat': '揀隻貓貓',
  'Watch the ring around the toe.': '留意腳趾旁邊嘅圓環。',
  'Tap the paw when the dot enters green.': '圓點入到綠色範圍，就撳貓掌。',
  'Choose a cat first': '先揀隻貓貓', 'Perfectly pampered!': '修甲完成，靚晒！', 'Time for a break': '休息吓先',
  '+1 extra upgrade': '額外 +1 次升級', 'Your normal upgrade is still waiting': '原本嘅升級機會仲喺度',
  'Play again  →': '再玩一次  →', 'Main menu': '主選單', 'One paw at a time': '逐隻貓掌嚟',
  'Tap paw to snip': '撳貓掌剪指甲', 'Wait…': '等陣…', 'Paw twitch': '貓掌郁緊', '✓ Snip!': '✓ 剪到喇！', 'Try again': '再試吓',
  'Tap anywhere on the paw when the dot enters green.': '圓點入到綠色範圍，撳貓掌任何位置。',
  'The next claw is selected for you · Space also works': '已揀好下一隻指甲 · 亦可撳空白鍵',
  'FREE PLAY': '自由玩', 'No mess · always-fed cats': '唔使執手尾 · 貓貓食飽晒',
  'Butt pats': '拍屁屁', 'Wand': '逗貓棒', 'Camera': '視角', 'Near': '行近', 'Far': '行遠',
  '− Zoom': '− 縮細', '+ Zoom': '+ 放大', 'Reset view': '重設視角',
  'Tap or stroke the selected cat’s butt.': '撳吓或者摸吓揀咗嗰隻貓嘅屁屁。',
  'Wave near any cat to catch its attention.': '喺貓貓附近揮動逗貓棒，引佢注意。',
  'Drag to look · right-drag to pan': '拖曳轉視角 · 按住右鍵拖曳平移',
  'Wheel: zoom · WASD / Q E: move · arrows above: move': '滾輪縮放 · WASD / Q E 或上面箭嘴移動',
  'Untimed': '不限時', 'Gyro off': '體感：關', 'Gyro on': '體感：開', 'Connecting…': '連接緊…',
  'Retry gyro': '重試體感', 'No gyro': '無體感', 'Zoom out': '縮細', 'Zoom in': '放大',
  'Sweeper': '掃把', 'Mop': '地拖', 'Brush': '毛刷', 'Food': '貓糧', 'Vacuum': '吸塵機',
  '3-IN-1': '三合一', 'Pause': '暫停', '✓  Play  →': '✓  開始玩  →', '✓  Next  →': '✓  下一步  →',
  'Sweeper + Mop + Brush → Vacuum': '掃把 + 地拖 + 毛刷 → 吸塵機',
  'Adopt': '領養', 'Upgrade': '升級', 'MAX': '最高', 'Vacuum unlocked': '吸塵機已解鎖',
  'Controls': '操作方法', 'Choose an adopted cat above the room.': '喺貓屋上面揀隻已領養嘅貓。',
  'Pet: tap or stroke the cat’s butt.': '摸貓：撳吓或者摸吓貓貓嘅屁屁。',
  'Wand: drag in the room to play.': '逗貓棒：喺貓屋入面拖曳同貓玩。',
  'Camera: drag to look, right-drag to pan.': '視角：拖曳轉視角，右鍵拖曳平移。',
  'Wheel or + / − to zoom. WASD / Q E to move.': '滾輪或 + / − 縮放，WASD / Q E 移動。',
  'Use the six direction buttons on touchscreens.': '觸控螢幕可用六個方向掣移動。',
  'Watch the ring around the active toe.': '留意要剪嗰隻腳趾旁邊嘅圓環。',
  'The dot sweeps back and forth.': '圓點會來回移動。',
  'Tap the paw or press Space when the dot is green.': '圓點變綠色，就撳貓掌或空白鍵。',
  'Each claw has its own green arc.': '每隻指甲都有自己嘅綠色範圍。',
  'Trim all four paws before time runs out.': '時間到之前，剪好四隻貓掌嘅指甲。',
  'Coming soon': '即將加入',
  'Reset rotation': '重設角度', 'Drag to rotate · edges to roll': '拖曳旋轉 · 沿邊緣拖曳翻轉',
  'Cat dex': '貓貓圖鑑', 'Adopt cats to reveal their profiles.': '領養貓貓，解鎖佢哋嘅檔案。',
  'View profile': '查看檔案', 'Not adopted': '未領養', 'Adopted · Profile unlocked': '已領養 · 檔案已解鎖',
  'Coat': '毛色', 'Care': '照顧', 'Keep fed, brushed and entertained.': '記得餵食、梳毛，同佢玩。',
  'Enjoys butt pats and chasing the wand.': '鍾意拍屁屁同追逗貓棒。',
  'Chocolate brown': '朱古力啡', 'Cream with dark accents': '奶油色配深色花紋', 'Slate grey': '石板灰',
  'Golden ginger': '金橙色', 'Blue grey': '藍灰色', 'Peach pink': '蜜桃粉紅', 'Warm ivory': '暖象牙白',
  'Sage green': '鼠尾草綠', 'Soft lilac': '淡紫色', 'Smoky grey': '煙灰色', 'Golden cream': '金奶油色',
  'Amber ginger': '琥珀橙', 'Brown with dark accents': '啡色配深色花紋', 'Taupe with dark accents': '灰褐色配深色花紋',
  'White with grey-brown tabby patches': '白色配灰褐虎斑',
  'Back': '返回', 'Main menu?': '返主選單？', 'Restart?': '重新開始？',
  'Your free play unlock and cats are saved.': '自由玩模式同貓貓都已儲存。', 'Progress will be reset.': '進度會重新計過。',
  'Cancel': '取消', 'Restart': '重新開始', 'Paused': '暫停咗', 'Resume  →': '繼續玩  →',
  'Restart Pawdicure': '重新修甲', 'Restart free play': '重新自由玩', 'Restart tutorial': '重新練習', 'Restart shift': '重新開工',
  'Victory': '過關喇！', 'Free play unlocked →': '自由玩已解鎖 →', 'Play again': '再玩一次', 'Game over': '玩完喇',
  'STAGES SURVIVED': '完成關數', 'TASKS COMPLETED': '完成任務',
  'Vacuum unlocked! Tap any mess to clean it.': '吸塵機解鎖咗！撳污糟嘅地方就清潔到。',
  'Vacuum unlocked!': '吸塵機解鎖咗！',
  'One tap clears poop, spills & fur.': '一撳就清走便便、嘔吐物同貓毛。',
  'Enter to activate. Tab for next control. Escape to pause or go back.': 'Enter 確認，Tab 揀下一個，Esc 暫停或返回。',
  'Touch or mouse to play. Tab to choose, Enter or Space to activate. Escape to pause.': '用觸控或滑鼠玩。Tab 揀選，Enter 或空白鍵確認，Esc 暫停。',
};

const templates: [RegExp, (...parts: string[]) => string][] = [
  [/^(\d+) \/ (\d+) adopted$/, (n, total) => `已領養 ${n} / ${total}`],
  [/^Get each to level 3 · (\d+)\/3 ready$/, n => `全部升到第 3 級 · 已完成 ${n}/3`],
  [/^Stage (\d+)\/5$/, n => `第 ${n}/5 關`], [/^Lesson (\d+)\/5$/, n => `練習 ${n}/5`],
  [/^(\d+) HP$/, n => `${n} 生命`], [/^(\d+) pats?$/, n => `拍咗 ${n} 次`],
  [/^(\d+) \/ 18 claws$/, n => `${n} / 18 隻指甲`], [/^(\d+) of 18 claws trimmed$/, n => `剪咗 ${n} / 18 隻指甲`],
  [/^Finish all four paws in (\d+) seconds\.$/, n => `${n} 秒內剪好四隻貓掌。`],
  [/^Ready, (.+)  →$/, name => `${name}，準備好  →`],
  [/^(.+) · (Front left|Front right|Back left|Back right)$/, (name, paw) => `${name} · ${{ 'Front left': '左前掌', 'Front right': '右前掌', 'Back left': '左後掌', 'Back right': '右後掌' }[paw]}`],
  [/^(\d+) clean snips · Space also works$/, n => `連續剪好 ${n} 隻 · 亦可撳空白鍵`],
  [/^Choose (.+?)(, selected)?$/, (name, selected) => `揀 ${name}${selected ? '，已揀選' : ''}`],
  [/^Adopt (.+)$/, name => `領養 ${name}`], [/^Pat (.+)$/, name => `拍吓 ${name}`],
  [/^Upgrade (.+) to level (\d+)$/, (tool, n) => `${translate(tool)}升到第 ${n} 級`],
  [/^(.+), (level (\d+)|one-tap cleanup)(, selected)?$/, (tool, _level, n, selected) => `${translate(tool)}，${n ? `第 ${n} 級` : '一撳清潔'}${selected ? '，已揀選' : ''}`],
  [/^(.+) loves those butt pats\.$/, name => `${name} 好鍾意你拍屁屁。`],
  [/^(.+) is chasing the wand!$/, name => `${name} 追緊逗貓棒！`],
  [/^(.+) scratched you!  −10 HP$/, name => `${name} 抓咗你！ −10 生命`],
  [/^(.+) approves\. For now\.$/, name => `${name} 暫時滿意喇。`],
  [/^Use the (.+) for this$/, tool => `呢度要用${translate(tool[0].toUpperCase() + tool.slice(1))}`],
];

export function translate(value: string): string {
  if (language === 'en') return value;
  if (cantonese[value]) return cantonese[value];
  for (const [pattern, format] of templates) {
    const match = value.match(pattern);
    if (match) return format(...match.slice(1));
  }
  return value; // Names, numbers and pictorial controls are shared between languages.
}

export function syncDocumentLanguage(focusedLabel?: string) {
  document.documentElement.lang = language;
  document.title = gameTitle();
  const description = focusedLabel
    ? `${focusedLabel}. ${translate('Enter to activate. Tab for next control. Escape to pause or go back.')}`
    : translate('Touch or mouse to play. Tab to choose, Enter or Space to activate. Escape to pause.');
  document.querySelector('#game')?.setAttribute('aria-label', `${gameTitle()}. ${description}`);
}
