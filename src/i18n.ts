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
  'Christmas at the cat lounge': '貓屋聖誕派對',
  'Cozy paws, festive mischief.': '暖笠笠嘅貓爪，聖誕搗蛋時間。',
  'Arrange room': '佈置房間', 'ARRANGE ROOM': '佈置房間', 'Room updated': '房間已更新',
  'Layouts': '房間佈局', 'Save': '儲存', 'Rotate': '轉向', 'Undo': '復原', 'Redo': '重做',
  'Grid: on': '格線：開', 'Grid: off': '格線：關', 'Furniture': '傢俬', 'Reset room': '還原房間',
  'Turn view': '轉視角', 'Fit room': '睇全間', 'Unplaced furniture': '未放置嘅傢俬',
  'Store': '收起', 'Furniture inventory': '傢俬儲物庫', 'Stored in inventory': '已收喺儲物庫',
  'Store in inventory': '收進儲物庫', 'Stored away. Find it under Furniture.': '已收起。去「傢俬」就搵得返。',
  'Top view': '俯視', 'Free view': '自由視角', 'More': '更多', 'Room tools': '佈置工具',
  'Grid': '格線', 'Fit': '全景', 'Reset': '還原', 'Current draft': '目前草稿', 'Moved to inventory': '已收進儲物庫',
  'Drag furniture · drag floor to orbit': '拖傢俬搬位 · 拖地板轉視角',
  'All': '全部', 'All furniture': '全部傢俬', 'In the room': '房內', 'Nothing here yet': '暫時冇嘢喺呢度',
  'Floor chair': '地板椅', 'Triangular table': '三角枱', 'Recliner set': '躺椅連腳凳',
  'Moved to inventory. Choose Inventory to place it again.': '已收喺儲物庫。揀「儲物庫」就可以再放返出嚟。',
  'Invalid inventory status.': '儲物庫狀態無效。',
  'Select furniture to move': '揀件傢俬搬位', 'Drag furniture · drag floor to pan': '拖傢俬搬位 · 拖地板移動視角',
  'Some furniture was not placed': '部分傢俬未能放置', 'Your layouts': '你嘅房間佈局',
  'Saved layout could not be opened': '未能開啟房間存檔', 'Original save kept. Showing the default room.': '原有存檔已保留。暫時顯示預設房間。',
  'Replace this layout?': '取代呢個佈局？', 'Layout could not be saved': '未能儲存佈局',
  'Save to a slot': '揀個位置儲存', 'Save layout': '儲存佈局', 'Continue': '繼續',
  'Your valid furniture stayed in place. Recover these items in Arrange room.': '放得落嘅傢俬都留喺原位。可以去「佈置房間」重新放置以下傢俬。',
  'Choose an item, then place it on clear floor.': '揀件傢俬，再放喺空嘅地板上。',
  'Choose an item to move.': '揀件傢俬搬位。', 'All furniture is placed.': '所有傢俬都放好喇。',
  'Not in the room': '未放喺房內', 'Placed': '已放置', 'The other slots will stay unchanged.': '其他儲存位置唔會變。',
  'Your changes are still here. Export a backup or use this layout for this session.': '你嘅修改仲喺度。可以匯出備份，或者今次繼續用呢個佈局。',
  'Retry': '再試', 'Export JSON': '匯出 JSON', 'Import JSON': '匯入 JSON', 'Use for this session': '今次繼續用',
  'Choose where to save. Another slot makes a copy.': '揀個儲存位置。揀另一個位置就會另存副本。',
  'Load a layout into your draft. Save to apply it.': '載入佈局試吓，儲存後先會套用。',
  'Saved on this browser. Export to back up or share.': '儲存喺呢個瀏覽器。匯出就可以備份或分享。',
  'Layout loaded into your draft. Save to apply.': '已載入草稿。儲存後套用。',
  'Layout imported into your draft. Save to apply.': '已匯入草稿。儲存後套用。', 'Layout exported.': '佈局已匯出。',
  'Olive sofa': '橄欖綠梳化', 'Cream loveseat': '奶油色雙人梳化', 'Floor chair 1': '地板椅 1',
  'Floor chair 3': '地板椅 3', 'Floor chair 4': '地板椅 4', 'Mural table': '壁畫旁邊枱',
  'Side table': '邊枱', 'Sofa table': '梳化旁邊枱', 'Pink flower bed': '粉紅花形貓床', 'Orange flower bed': '橙色花形貓床',
  'Window recliner 1': '窗邊躺椅連腳凳 1', 'Window recliner 2': '窗邊躺椅連腳凳 2',
  'Floor chair 2': '地板椅 2', 'Mural chair left': '壁畫左邊椅', 'Mural chair right': '壁畫右邊椅',
  'Table by mural': '壁畫旁邊枱', 'Table by gray seats': '灰椅旁邊枱', 'Table by green sofa': '綠梳化旁邊枱',
  'Rear flower bed': '後方花形貓床', 'White flower bed': '白色花形貓床', 'Terracotta flower bed': '橙色花形貓床',
  'Bentwood pod': '曲木貓窩', 'Entrance cat tree': '入口貓樹', 'Window cat tree': '窗邊貓樹',
  'Recliner 1 and footstool': '躺椅連腳凳 1', 'Recliner 2 and footstool': '躺椅連腳凳 2', 'Exercise wheel': '貓跑輪',
  'outside the room': '超出房間範圍', 'intersects a wall': '同牆身重疊', 'overlaps fixed furniture': '同固定傢俬重疊',
  'overlaps another item': '同另一件傢俬重疊', 'invalid position or rotation': '位置或方向無效',
  'Furniture is no longer available': '呢件傢俬已不再提供', 'Invalid position or rotation': '位置或方向無效',
  'New furniture: choose a position': '新增傢俬：請揀個位置',
  'Blocks access to the entrance, passage or feeding area': '擋住入口、通道或餵食區',
  'Not enough reachable floor space for the cats': '冇足夠貓貓行得到嘅空位',
  'There is not enough clear floor for the cats.': '冇足夠空位畀貓貓。',
  'Layout files must be smaller than 100 KB.': '佈局檔案唔可以大過 100 KB。',
  'Invalid furniture position or rotation.': '傢俬位置或方向無效。', 'Invalid room layout file.': '房間佈局檔案無效。',
  'Invalid room layout JSON.': '房間佈局 JSON 格式無效。', 'Unsupported room layout file version.': '未支援呢個佈局檔案版本。',
  'Duplicate furniture ID.': '傢俬識別碼重複。', 'Duplicate furniture ID or JSON field.': '傢俬識別碼或 JSON 欄位重複。',
  'Invalid furniture ID.': '傢俬識別碼無效。', 'Invalid unplaced furniture entry.': '未放置傢俬資料無效。',
  'Invalid unplaced furniture reason.': '未放置傢俬原因資料無效。', 'Too many furniture entries.': '傢俬項目過多。',
  'Unsupported or invalid room save. Original save kept.': '房間存檔版本未支援或資料無效。原有存檔已保留。',
  'The saved room could not be read. Original save kept.': '讀唔到房間存檔。原有存檔已保留。',
  'Room storage is unavailable. Export or use this layout for this session.': '暫時無法儲存。請匯出備份或今次繼續用。',
  'Room could not be saved. Retry, export, or use it for this session.': '儲存唔到。可以再試、匯出，或今次繼續用。',
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
  'Look': '望四周', 'Move': '移動',
  'Drag to look around': '拖曳望四周',
  'Drag sideways to strafe · up to walk forward': '左右拖曳平移 · 向上拖曳行前',
  'Two fingers: pan / pinch zoom · wheel: zoom': '雙指平移／捏合縮放 · 滾輪縮放',
  'Camera: choose Look or Move, then drag.': '視角：揀「望四周」或「移動」，再拖曳。',
  'WASD / Q E: move · + / −: zoom': 'WASD / Q E：移動 · + / −：縮放',
  'Tap or stroke the selected cat’s butt.': '撳吓或者摸吓揀咗嗰隻貓嘅屁屁。',
  'Tap a butt to pat · tap the exercise wheel to invite.': '撳屁屁摸貓 · 撳貓跑輪邀請貓貓玩',
  'The wheel is busy. Try when it is free.': '有貓用緊跑輪，等佢用完再試吓。',
  'Cannot reach the wheel from here. Try again shortly.': '暫時行唔到去跑輪，等陣再試吓。',
  'Wave near any cat to catch its attention.': '喺貓貓附近揮動逗貓棒，引佢注意。',
  'Drag to look · right-drag to pan': '拖曳轉視角 · 按住右鍵拖曳平移',
  'Untimed': '不限時', 'Gyro off': '體感：關', 'Gyro on': '體感：開', 'Connecting…': '連接緊…',
  'Retry gyro': '重試體感', 'No gyro': '無體感', 'Zoom out': '縮細', 'Zoom in': '放大',
  'Sweeper': '掃把', 'Mop': '地拖', 'Brush': '毛刷', 'Food': '貓糧', 'Vacuum': '吸塵機',
  '3-IN-1': '三合一', 'Pause': '暫停', '✓  Play  →': '✓  開始玩  →', '✓  Next  →': '✓  下一步  →',
  'Sweeper + Mop + Brush → Vacuum': '掃把 + 地拖 + 毛刷 → 吸塵機',
  'Adopt': '領養', 'Upgrade': '升級', 'MAX': '最高', 'Vacuum unlocked': '吸塵機已解鎖',
  'Controls': '操作方法', 'Choose an adopted cat above the room.': '喺貓屋上面揀隻已領養嘅貓。',
  'Pet: tap or stroke the cat’s butt.': '摸貓：撳吓或者摸吓貓貓嘅屁屁。',
  'Wand: drag in the room to play.': '逗貓棒：喺貓屋入面拖曳同貓玩。',
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
  'Grey-brown tabby with white toe tips': '灰褐虎斑配白色趾尖',
  'Back': '返回', 'Main menu?': '返主選單？', 'Restart?': '重新開始？',
  'Welcome home': '歡迎返嚟', 'Skip entrance →': '直接入房 →',
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
  [/^Unplaced \((\d+)\)$/, n => `未放置 (${n})`],
  [/^Inventory \((\d+)\)$/, n => `儲物庫 (${n})`],
  [/^Slot (\d+)( · active)?$/, (n, active) => `位置 ${n}${active ? ' · 使用中' : ''}`],
  [/^Replace Slot (\d+)\?$/, n => `取代位置 ${n} 嘅佈局？`],
  [/^(.+): (outside the room|intersects a wall|overlaps fixed furniture|overlaps another item|invalid position or rotation)$/, (name, reason) => `${translate(name)}：${translate(reason)}`],
  [/^Blocks access to (.+)$/, name => `擋住${({ tree: '貓樹', post: '貓抓柱', bench: '梳化', bed: '貓床', wheel: '跑輪', box: '貓窩', cabinet: '櫃', window: '窗邊' } as Record<string, string>)[name] ?? name}嘅入口`],
  [/^Blocks the (.+) interaction route$/, name => `擋住${({ tree: '貓樹', post: '貓抓柱', bench: '梳化', bed: '貓床', wheel: '跑輪', box: '貓窩', cabinet: '櫃', window: '窗邊' } as Record<string, string>)[name] ?? name}嘅活動路線`],
  [/^(.+) already has the wheel\.$/, name => `${name} 已經去緊或者用緊跑輪。`],
  [/^(.+) is busy\. Try after they step down\.$/, name => `${name} 忙緊，等佢落返地再試吓。`],
  [/^(.+) is heading to the wheel!$/, name => `${name} 行緊去跑輪喇！`],
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
