// ============================================================
// DATFO Dashboard — клиентская логика. Bilingual (RU/UZ).
// ============================================================

const API_BASE = window.location.origin;
let userData = null;
let allProjects = [];
let currentFilter = 'all';
let currentSearch = '';
let currentLang = 'ru';
// Admin state
let adminPharmacies = [];
let adminSearch = '';
let adminFilter = 'all';

// ============================================================
// LANGUAGE DICTIONARY
// ============================================================
const LANG = {
  ru: {
    deadline: 'До конца квартала',
    days: 'дн.',
    earnedLabel: 'Доход за квартал',
    earnedSub: 'сум · начислено бонусов',
    earnedDone: 'Квартал выполнен — бонус начислен',
    earnedAlmost: 'Финиш близко — завершите план',
    lostTitle: 'Доступно к получению',
    lostCTA: 'Связаться с менеджером',
    lostText_low: 'Выполнение плана — <b>{pct}%</b>. До закрытия квартала осталось <b>{days} дн.</b> Свяжитесь с менеджером — он поможет составить план закупки, чтобы вы получили полный бонус.',
    lostText_mid: 'Вы уже на <b>{pct}%</b>. До <b>100%</b> и полного бонуса остался небольшой шаг. В вашем распоряжении <b>{days} дн.</b>',
    lostText_high: 'План выполнен. Перевыполнение даёт <b>дополнительный бонус</b> — обсудите с менеджером, как закрыть квартал с максимальной выплатой.',
    spGold: 'Аптеки категории <b>Gold</b> в среднем выполняют план на <b>112%</b>. Сохраняйте темп — и оставайтесь среди лидеров.',
    spSilver: 'Аптеки <b>Silver</b>, перешедшие в <b>Gold</b>, в среднем зарабатывают в <b>2,3 раза больше</b>. Следующая ступень доступна вам.',
    statsWin: 'Выполнено',
    statsWinDesc: 'бонус начислен',
    statsAlmost: 'В работе',
    statsAlmostDesc: 'ускорить',
    statsRisk: 'Требует внимания',
    statsRiskDesc: 'риск потери бонуса',
    quarterTitle: 'Прогресс квартала',
    quarterSub: 'Чем выше процент — тем выше выплата',
    quarterPlan: 'План квартала',
    quarterDone: 'Выполнено',
    qm_loading: 'Загружаем ваши данные...',
    qm_done: '<b>План выполнен.</b> Результат за квартал — {pct}%. Бонус начислен.',
    qm_high: '<b>Финишная прямая.</b> До полного бонуса осталось {left}%. Закажите <b>{remaining}</b> — и план закрыт.',
    qm_mid: '<b>Вы на полпути.</b> До конца квартала {days} дн. — этого достаточно, чтобы выйти на 100%.',
    qm_low: '<b>Требуется ускорение.</b> До конца квартала {days} дн. Свяжитесь с менеджером — он подберёт приоритетные позиции для закупки.',
    dynamicsTitle: 'Динамика доходов',
    dynamicsSub: 'Сравните результаты месяц к месяцу',
    di_grow: '<b>Доход вырос на {n}%</b> за квартал. Стабильный рост — хороший знак.',
    di_drop: '<b>В последнем месяце доход снизился.</b> Свяжитесь с менеджером для корректировки плана.',
    di_top: '<b>Каждый месяц — 100%+.</b> Вы среди лучших аптек DATFO.',
    di_stable: '<b>Стабильность — основа дохода.</b> Регулярное выполнение плана — полный бонус каждый месяц.',
    monthsTitle: 'По месяцам',
    monthsSub: 'Закрытый месяц — выплата на счёт',
    monthJan: 'Январь', monthFeb: 'Февраль', monthMar: 'Март',
    monthJanShort: 'Янв', monthFebShort: 'Фев', monthMarShort: 'Мар',
    monthFact: 'Факт', monthPlan: 'План',
    bonusTitle: 'Бонусы',
    bonusSub: 'Выплаты по программам DATFO',
    bonus_accrued_label: 'Начислено',
    bonus_accrued_desc: 'Гарантированная сумма — уже подтверждена',
    bonus_potential_label: 'Потенциал',
    bonus_potential_desc: 'Дополнительный бонус при выполнении плана до конца квартала',
    bonus_potential_badge: 'К получению',
    bonus_completed_label: 'Выплачено',
    bonus_completed_desc: 'Уже зачислено на счёт',
    projectsTitle: 'Активные проекты',
    projectsSub: 'Нажмите на проект, чтобы посмотреть продукцию',
    searchPlaceholder: 'Найти проект',
    filterAll: 'Все',
    filterCompleted: 'Выполнено',
    filterPartial: 'В работе',
    filterCritical: 'Требует внимания',
    th_project: 'Проект', th_plan: 'План', th_fact: 'Факт', th_bonus: 'Бонус',
    projectLost: 'Доступно ещё <b>{amount}</b> сум при выполнении плана',
    emptyProjects: 'Проектов не найдено',
    loadingProjects: 'Загрузка проектов...',
    ctaTitle: 'Нужна консультация?',
    ctaText: 'Персональный менеджер поможет выбрать проекты с максимальной выплатой именно для вашей аптеки.',
    ctaBtn: 'Связаться с менеджером',
    stickyText: 'Доступно к получению: {amount} сум',
    welcomeTitle: 'Добро пожаловать в DATFO!',
    welcomeText: 'Покажем за 30 секунд, как зарабатывать больше с DATFO.',
    welcomeSkip: 'Пропустить',
    welcomeStart: 'Начать →',
    tourSkip: 'Пропустить',
    tourNext: 'Далее →',
    tourDone: 'Готово ✓',
    tourStep: 'ШАГ {n} ИЗ {total}',
    tour_earned_t: '💰 Ваш доход', tour_earned: 'Сколько бонусов вы уже заработали за квартал. Это деньги в вашем кармане.',
    tour_lost_t: '🔥 Упущенная выгода', tour_lost: 'Сколько вы можете дополнительно получить, если довыполните план до конца квартала.',
    tour_deadline_t: '⏳ Дедлайн', tour_deadline: 'Сколько дней осталось до закрытия квартала. После этого — бонус сгорит.',
    tour_stats_t: '🎯 Статус проектов', tour_stats: 'Победы — бонус ваш. Почти у цели — нужно ускориться. Зона риска — теряете деньги.',
    tour_dyn_t: '📈 Динамика дохода', tour_dyn: 'Как растёт ваш заработок месяц к месяцу. Сравнивайте — стремитесь выше.',
    tour_bonus_t: '🎁 Бонусы', tour_bonus: 'Начислено — уже ваше. Потенциальный — можно получить. Выполнено — выплачено.',
    tour_proj_t: '📋 Проекты', tour_proj: 'Нажмите на любой — узнаете, какую продукцию заказать, чтобы выполнить план.',
    tour_cta_t: '📞 Менеджер на связи', tour_cta: 'Не уверены, с чего начать? Менеджер подберёт лучшие проекты для вашей аптеки.',
    contactManager: 'Свяжитесь с вашим менеджером:\n\n👤 {name}\n\nОн поможет увеличить ваш доход и подобрать выгодные проекты.',
    contactManagerNoName: 'Свяжитесь с менеджером DATFO через бота.\nОн поможет увеличить ваш доход.',
    mgrRole: 'Ваш персональный менеджер',
    mgrHint: 'Свяжитесь по телефону или в Telegram — менеджер ответит и поможет с проектами.',
    mgrPhone: 'Телефон',
    mgrTelegram: 'Telegram',
    mgrNoContacts: 'Контакты менеджера пока не указаны. Обратитесь к администратору DATFO.',
    productsStub: 'Продукция проекта «{name}» появится здесь.\n\nДоделываем интеграцию с Excel-листом продукции.',
    pharmInnLabel: 'ИНН:',
    pharmManager: 'Менеджер:',
    pharmPartner: '✓ Партнёр DATFO',
    noPharm: 'У вашего аккаунта нет привязанных аптек. Обратитесь к менеджеру.',
    errLoad: 'Не удалось загрузить данные: ',
    errNoTg: 'Нет tg_id и нет initData. Откройте через бота или добавьте ?tg_id=... в URL.',
    errPrefix: '⚠ Ошибка загрузки',
    footer: 'DATFO · Дашборд аптеки · v5.0',
    adminTitle: 'Все аптеки',
    adminSubtitle: '{n} аптек в системе',
    adminSearchPlaceholder: 'Поиск: аптека / ИНН / менеджер',
    adminBack: '← К списку аптек',
    adminEmpty: 'По запросу ничего не найдено',
    adminMgr: 'Менеджер:',
    adminInn: 'ИНН:',
    adminBonus: 'Бонус:',
    adminNoMgr: 'без менеджера',
  },
  uz: {
    deadline: 'Chorak oxirigacha',
    days: 'kun',
    earnedLabel: 'Chorakdagi daromad',
    earnedSub: "so'm · hisoblangan bonuslar",
    earnedDone: 'Chorak rejasi bajarildi — bonus hisoblandi',
    earnedAlmost: 'Marra yaqin — rejani yakunlang',
    lostTitle: 'Olish mumkin',
    lostCTA: "Menejer bilan bog'lanish",
    lostText_low: "Reja bajarilishi — <b>{pct}%</b>. Chorak yopilishigacha <b>{days} kun</b> qoldi. Menejer bilan bog'laning — u to'liq bonus olish uchun buyurtma rejasini tuzib beradi.",
    lostText_mid: "Siz <b>{pct}%</b>dasiz. <b>100%</b> va to'liq bonusgacha kichik qadam qoldi. Sizda <b>{days} kun</b> bor.",
    lostText_high: "Reja bajarildi. Ortiqcha bajarish <b>qo'shimcha bonus</b> beradi — menejer bilan chorakni maksimal to'lov bilan yopish bo'yicha gaplashing.",
    spGold: '<b>Gold</b> toifasidagi dorixonalar rejani o\'rtacha <b>112%</b> bajaradi. Tempni saqlang — yetakchilar orasida qoling.',
    spSilver: "<b>Silver</b>dan <b>Gold</b>ga o'tgan dorixonalar o'rtacha <b>2,3 marta ko'p</b> daromad oladi. Keyingi bosqich sizga ochiq.",
    statsWin: "Bajarildi",
    statsWinDesc: 'bonus hisoblandi',
    statsAlmost: 'Ishda',
    statsAlmostDesc: 'tezlashtirish',
    statsRisk: "E'tibor talab qiladi",
    statsRiskDesc: "bonus yo'qotish xavfi",
    quarterTitle: 'Chorak yutug\'i',
    quarterSub: "Foiz qancha yuqori — to'lov shuncha katta",
    quarterPlan: 'Chorak rejasi',
    quarterDone: 'Bajarildi',
    qm_loading: "Ma'lumotlar yuklanmoqda...",
    qm_done: "<b>Reja bajarildi.</b> Chorak natijasi — {pct}%. Bonus hisoblandi.",
    qm_high: "<b>Marra yaqin.</b> To'liq bonusgacha {left}% qoldi. <b>{remaining}</b> buyurtma qiling — reja yopildi.",
    qm_mid: "<b>Yarim yo'ldasiz.</b> Chorak oxirigacha {days} kun — 100% ga chiqish uchun yetarli.",
    qm_low: "<b>Tezlashtirish kerak.</b> Chorak oxirigacha {days} kun. Menejer bilan bog'laning — u ustuvor pozitsiyalarni tanlab beradi.",
    dynamicsTitle: "Daromad dinamikasi",
    dynamicsSub: "Natijalarni oydan-oyga solishtiring",
    di_grow: "<b>Daromadingiz chorak davomida {n}% o'sdi.</b> Barqaror o'sish — yaxshi belgi.",
    di_drop: "<b>Oxirgi oyda daromad pasaydi.</b> Rejani tuzatish uchun menejer bilan bog'laning.",
    di_top: "<b>Har oyda 100%+ bajarish.</b> Siz DATFO eng yaxshi dorixonalari qatorida.",
    di_stable: "<b>Barqarorlik — daromadning asosi.</b> Rejani muntazam bajaring — har oy to'liq bonus oling.",
    monthsTitle: "Oylar bo'yicha",
    monthsSub: "Yopilgan oy — hisobga to'lov",
    monthJan: 'Yanvar', monthFeb: 'Fevral', monthMar: 'Mart',
    monthJanShort: 'Yan', monthFebShort: 'Fev', monthMarShort: 'Mar',
    monthFact: 'Fakt', monthPlan: 'Reja',
    bonusTitle: 'Bonuslar',
    bonusSub: 'DATFO dasturlari bo\'yicha to\'lovlar',
    bonus_accrued_label: 'Hisoblangan',
    bonus_accrued_desc: 'Kafolatlangan summa — allaqachon tasdiqlangan',
    bonus_potential_label: 'Potensial',
    bonus_potential_desc: "Chorak oxirigacha rejani bajarsangiz — qo'shimcha bonus",
    bonus_potential_badge: 'Olish mumkin',
    bonus_completed_label: "To'langan",
    bonus_completed_desc: 'Hisobingizga allaqachon zachisleno',
    projectsTitle: 'Faol loyihalar',
    projectsSub: "Loyihaga bosing — mahsulotlarni ko'ring",
    searchPlaceholder: 'Loyiha topish',
    filterAll: 'Hammasi',
    filterCompleted: "Bajarildi",
    filterPartial: 'Ishda',
    filterCritical: "E'tibor talab qiladi",
    th_project: 'Loyiha', th_plan: 'Reja', th_fact: 'Fakt', th_bonus: 'Bonus',
    projectLost: "Reja bajarilganda yana <b>{amount}</b> so'm olish mumkin",
    emptyProjects: 'Loyiha topilmadi',
    loadingProjects: 'Loyihalar yuklanmoqda...',
    ctaTitle: 'Maslahat kerakmi?',
    ctaText: "Shaxsiy menejer aynan sizning dorixonangiz uchun maksimal to'lov beradigan loyihalarni tanlab beradi.",
    ctaBtn: "Menejer bilan bog'lanish",
    stickyText: "Olish mumkin: {amount} so'm",
    welcomeTitle: 'DATFO ga xush kelibsiz!',
    welcomeText: "30 soniyada DATFO bilan ko'proq qanday ishlab olishni ko'rsatamiz.",
    welcomeSkip: "O'tkazib yuborish",
    welcomeStart: 'Boshlash →',
    tourSkip: "O'tkazib yuborish",
    tourNext: 'Keyingi →',
    tourDone: 'Tayyor ✓',
    tourStep: '{n} / {total} QADAM',
    tour_earned_t: '💰 Sizning daromadingiz', tour_earned: 'Chorak davomida qancha bonus ishlab olganingiz. Bu sizning hamyoningizdagi pul.',
    tour_lost_t: '🔥 Boy berilgan foyda', tour_lost: 'Agar chorak oxirigacha rejani bajarsangiz, qo\'shimcha qancha olishingiz mumkin.',
    tour_deadline_t: '⏳ Muddat', tour_deadline: 'Chorak yopilishigacha qancha kun qoldi. Shundan keyin bonus yonib ketadi.',
    tour_stats_t: "🎯 Loyihalar holati", tour_stats: "G'alabalar — bonus sizniki. Maqsad yaqin — tezlashing. Xavf zonasi — pul yo'qotyapsiz.",
    tour_dyn_t: "📈 Daromad dinamikasi", tour_dyn: "Daromadingiz oydan-oyga qanday o'sayotgani. Solishtiring — balandga intiling.",
    tour_bonus_t: '🎁 Bonuslar', tour_bonus: "Hisoblangan — sizniki. Potensial — olish mumkin. Bajarilgan — to'langan.",
    tour_proj_t: '📋 Loyihalar', tour_proj: "Har birini bosib, rejani bajarish uchun nima buyurtma qilishni bilib oling.",
    tour_cta_t: "📞 Menejer aloqada", tour_cta: "Nimadan boshlashni bilmaysizmi? Menejer dorixonangiz uchun eng yaxshi loyihalarni tanlab beradi.",
    contactManager: "Menejeringiz bilan bog'laning:\n\n👤 {name}\n\nU sizga daromadni oshirishga va foydali loyihalarni tanlashga yordam beradi.",
    contactManagerNoName: "Bot orqali DATFO menejeri bilan bog'laning.\nU sizga daromadni oshirishga yordam beradi.",
    mgrRole: 'Sizning shaxsiy menejeringiz',
    mgrHint: "Telefon yoki Telegram orqali bog'laning — menejer javob beradi va loyihalarda yordam beradi.",
    mgrPhone: 'Telefon',
    mgrTelegram: 'Telegram',
    mgrNoContacts: "Menejer kontaktlari hali ko'rsatilmagan. DATFO administratoriga murojaat qiling.",
    productsStub: '«{name}» loyihasi mahsulotlari shu yerda paydo bo\'ladi.\n\nMahsulotlar Excel-varag\'i bilan integratsiya tugatilmoqda.',
    pharmInnLabel: 'INN:',
    pharmManager: 'Menejer:',
    pharmPartner: '✓ DATFO sherigi',
    noPharm: "Sizning akkauntingizga dorixona biriktirilmagan. Menejerga murojaat qiling.",
    errLoad: "Ma'lumotlarni yuklab bo'lmadi: ",
    errNoTg: "tg_id va initData yo'q. Bot orqali oching yoki URL ga ?tg_id=... qo'shing.",
    errPrefix: "⚠ Yuklash xatosi",
    footer: 'DATFO · Dorixona paneli · v5.0',
    adminTitle: 'Hamma dorixonalar',
    adminSubtitle: 'Tizimda {n} ta dorixona',
    adminSearchPlaceholder: 'Qidirish: dorixona / INN / menejer',
    adminBack: "← Dorixonalar ro'yxatiga",
    adminEmpty: "Hech narsa topilmadi",
    adminMgr: 'Menejer:',
    adminInn: 'INN:',
    adminBonus: 'Bonus:',
    adminNoMgr: 'menejersiz',
  }
};

function t(key, params) {
  let s = (LANG[currentLang] && LANG[currentLang][key]) || LANG.ru[key] || key;
  if (params) for (const k in params) s = s.replaceAll('{' + k + '}', params[k]);
  return s;
}

function applyLang() {
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-lang') === currentLang);
  });
}

window.setLang = function(lang) {
  if (lang !== 'ru' && lang !== 'uz') return;
  currentLang = lang;
  try { localStorage.setItem('datfo_lang', lang); } catch (e) {}
  applyLang();
  // Перерисовать всё динамическое если данные уже загружены
  if (userData) render(userData);
  else renderDeadline();
};

function detectLang() {
  try {
    const saved = localStorage.getItem('datfo_lang');
    if (saved === 'ru' || saved === 'uz') return saved;
  } catch (e) {}
  const fromUser = userData && userData.language;
  if (fromUser === 'uz') return 'uz';
  return 'ru';
}

// ============================================================
// INIT
// ============================================================
(function init() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); tg.setBackgroundColor('#f8fafc'); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();

async function main() {
  currentLang = detectLang();
  applyLang();
  document.getElementById('projSearch').addEventListener('input', e => {
    currentSearch = e.target.value.toLowerCase();
    renderProjects();
  });
  document.getElementById('projFilter').addEventListener('change', e => {
    currentFilter = e.target.value;
    renderProjects();
  });
  // Admin list filters
  const adminSearchEl = document.getElementById('adminSearch');
  const adminFilterEl = document.getElementById('adminFilter');
  if (adminSearchEl) adminSearchEl.addEventListener('input', e => {
    adminSearch = e.target.value.toLowerCase();
    renderAdminList();
  });
  if (adminFilterEl) adminFilterEl.addEventListener('change', e => {
    adminFilter = e.target.value;
    renderAdminList();
  });
  renderDeadline();
  await loadUserData();
}

// ============================================================
// DATA FETCH
// ============================================================
async function loadUserData() {
  const urlParams = new URLSearchParams(window.location.search);
  const tgIdFromUrl = urlParams.get('tg_id');
  const initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';

  const url = new URL(API_BASE + '/api/me');
  if (initData) url.searchParams.set('init_data', initData);
  else if (tgIdFromUrl) url.searchParams.set('tg_id', tgIdFromUrl);
  else { renderError(t('errNoTg')); return; }

  try {
    const res = await fetch(url, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        ...(initData ? { 'X-Telegram-Init-Data': initData } : {})
      }
    });
    if (!res.ok) {
      const txt = await res.text();
      renderError(`API ${res.status}: ${txt}`);
      return;
    }
    userData = await res.json();
    window.userData = userData;
    // Если язык не был сохранён вручную — взять из профиля БД
    try {
      if (!localStorage.getItem('datfo_lang') && userData.language === 'uz') {
        currentLang = 'uz';
        applyLang();
      }
    } catch (e) {}
    console.log('[app.js] User data:', userData);
    render(userData);
  } catch (e) {
    console.error('[app.js] fetch failed:', e);
    renderError(t('errLoad') + e.message);
  }
}

// ============================================================
// RENDER
// ============================================================
function render(data) {
  // Admin: show list of all pharmacies first
  if (data.is_admin && Array.isArray(data.pharmacies) && data.pharmacies.length > 1) {
    adminPharmacies = data.pharmacies;
    showAdminList();
    return;
  }
  const pharm = (data.pharmacies && data.pharmacies[0]) || null;
  if (!pharm) { renderError(t('noPharm')); return; }
  renderDashboard(pharm);
}

function renderDashboard(pharm) {
  const d = pharm.dashboard || {};
  renderPharmacy(pharm, d);
  renderIncome(d);
  renderLostOpportunity(d);
  renderSocialProof(d);
  renderStats(d.stats);
  renderQuarter(d.totals);
  renderDynamics(d.totals && d.totals.months ? d.totals.months : d.months);
  renderMonths(d.totals && d.totals.months ? d.totals.months : d.months);
  renderBonuses(d.bonuses);

  allProjects = Array.isArray(d.projects) ? d.projects : [];
  renderProjects();
  renderStickyCta(d);
}

// ============================================================
// ADMIN VIEW
// ============================================================
function showAdminList() {
  document.getElementById('adminListView').style.display = '';
  document.getElementById('dashboardView').style.display = 'none';
  document.getElementById('backToListBtn').style.display = 'none';
  // Sticky CTA не нужен в списке
  const sticky = document.getElementById('stickyCta');
  if (sticky) sticky.classList.remove('visible');
  renderAdminList();
}

function showDashboardView(fromAdmin) {
  document.getElementById('adminListView').style.display = 'none';
  document.getElementById('dashboardView').style.display = '';
  document.getElementById('backToListBtn').style.display = fromAdmin ? '' : 'none';
  window.scrollTo({ top: 0, behavior: 'instant' });
}

window.selectPharmacy = function(inn) {
  const pharm = adminPharmacies.find(p => String(p.inn) === String(inn));
  if (!pharm) return;
  renderDashboard(pharm);
  showDashboardView(true);
};

window.backToList = function() {
  showAdminList();
};

function renderAdminList() {
  const list = document.getElementById('adminPharmList');
  const countEl = document.getElementById('adminCount');
  if (!list) return;

  let filtered = adminPharmacies.slice();
  if (adminFilter !== 'all') {
    filtered = filtered.filter(p => statusOf(p) === adminFilter);
  }
  if (adminSearch) {
    filtered = filtered.filter(p => {
      const d = p.dashboard || {};
      const hay = `${p.name || ''} ${p.business || ''} ${p.inn || ''} ${d.manager || ''}`.toLowerCase();
      return hay.includes(adminSearch);
    });
  }

  if (countEl) countEl.textContent = t('adminSubtitle', { n: adminPharmacies.length });

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state" style="margin-top: 8px;"><div class="empty-state-icon">😔</div><div>${t('adminEmpty')}</div></div>`;
    return;
  }

  list.innerHTML = filtered.map(p => {
    const d = p.dashboard || {};
    const pct = (d.totals && d.totals.quarter_percent != null) ? Number(d.totals.quarter_percent) : null;
    const pctCls = pct == null ? '' : pct >= 100 ? 'pct-success' : pct >= 50 ? 'pct-warning' : 'pct-danger';
    const pctText = pct == null ? '—' : pct + '%';
    const mgr = (d.manager || '').trim() || t('adminNoMgr');
    const bonus = (d.totals && d.totals.total_bonus) || (d.bonuses && d.bonuses.accrued && d.bonuses.accrued.amount) || '0';
    const innSafe = escapeHtml(String(p.inn || ''));
    const name = p.business || p.name || '—';
    return `
      <div class="admin-row" onclick="selectPharmacy('${innSafe}')">
        <div class="admin-row-head">
          <div class="admin-row-name">${escapeHtml(name)}</div>
          <div class="admin-row-pct ${pctCls}">${pctText}</div>
        </div>
        <div class="admin-row-meta">
          <span>${t('adminInn')} <b>${innSafe}</b></span>
          <span>${t('adminMgr')} <b>${escapeHtml(mgr)}</b></span>
        </div>
        <div class="admin-row-bonus">${t('adminBonus')} <b>${escapeHtml(String(bonus))}</b></div>
      </div>`;
  }).join('');
}

function statusOf(pharm) {
  const pct = pharm.dashboard && pharm.dashboard.totals && pharm.dashboard.totals.quarter_percent;
  if (pct == null) return 'critical';
  const n = Number(pct);
  if (n >= 100) return 'completed';
  if (n >= 50) return 'partial';
  return 'critical';
}

function renderPharmacy(pharm, d) {
  setText('#pharmName', pharm.business || pharm.name || '—');
  const meta = [];
  if (d.region) meta.push(d.region);
  if (d.district) meta.push(d.district);
  if (d.manager) meta.push(t('pharmManager') + ' ' + d.manager);
  setText('#pharmMeta', meta.join(' · ') || '—');
  setText('#pharmInn', t('pharmInnLabel') + ' ' + (pharm.inn || '—'));

  const tags = document.getElementById('pharmTags');
  tags.innerHTML = '';
  if (d.category) {
    const tag = document.createElement('span');
    const cat = d.category.toLowerCase();
    tag.className = 'tag ' + (cat === 'gold' ? 'tag-gold' : 'tag-silver');
    tag.textContent = '★ ' + d.category;
    tags.appendChild(tag);
  }
  const lvl = document.createElement('span');
  lvl.className = 'tag';
  lvl.style.cssText = 'background: rgba(30,122,52,0.1); color: var(--primary);';
  lvl.textContent = t('pharmPartner');
  tags.appendChild(lvl);
}

function renderIncome(d) {
  const amount = d.income_quarter || (d.totals && d.totals.total_bonus) || '—';
  setText('#incomeAmount', amount);
  const pct = d.totals && d.totals.quarter_percent;
  let sub = t('earnedSub');
  if (pct != null && pct >= 100) sub = t('earnedDone');
  else if (pct != null && pct >= 80) sub = t('earnedAlmost');
  setText('#incomeSub', sub);
}

function renderLostOpportunity(d) {
  const bonuses = d.bonuses || {};
  const potential = parseMoney((bonuses.potential && bonuses.potential.amount) || '');
  const accrued = parseMoney((bonuses.accrued && bonuses.accrued.amount) || '');
  const lost = Math.max(0, potential - accrued);

  const hero = document.getElementById('heroLost');
  if (lost <= 0) { hero.style.display = 'none'; return; }
  hero.style.display = 'block';
  setText('#lostAmount', formatMoney(lost) + ' ' + (currentLang === 'uz' ? "so'm" : 'сум'));

  const pct = d.totals && d.totals.quarter_percent != null ? Number(d.totals.quarter_percent) : null;
  const daysLeft = daysToQuarterEnd();
  let key = 'lostText_high';
  if (pct != null && pct < 50) key = 'lostText_low';
  else if (pct != null && pct < 100) key = 'lostText_mid';
  document.getElementById('lostText').innerHTML = t(key, { pct: pct ?? 0, days: daysLeft });
}

function renderSocialProof(d) {
  const sp = document.getElementById('socialProof');
  const cat = (d.category || '').toLowerCase();
  const txt = document.getElementById('socialProofText');
  if (cat === 'gold') {
    sp.style.display = '';
    txt.innerHTML = t('spGold');
  } else if (cat === 'silver') {
    sp.style.display = '';
    txt.innerHTML = t('spSilver');
  } else {
    sp.style.display = 'none';
  }
}

function renderStats(stats) {
  stats = stats || { completed: 0, partial: 0, critical: 0 };
  setText('#statCompleted', stats.completed ?? 0);
  setText('#statPartial', stats.partial ?? 0);
  setText('#statCritical', stats.critical ?? 0);
}

function renderQuarter(totals) {
  totals = totals || {};
  setText('#qsPlan', totals.quarter_plan || '—');
  const pctNum = totals.quarter_percent != null ? Number(totals.quarter_percent) : null;
  setText('#qsPercent', pctNum != null ? pctNum + '%' : '—');

  const fill = document.getElementById('quarterFill');
  if (pctNum != null) {
    fill.style.width = Math.min(pctNum, 100) + '%';
    if (pctNum < 50) fill.style.background = 'linear-gradient(90deg, var(--danger), var(--warning))';
    else if (pctNum < 100) fill.style.background = 'linear-gradient(90deg, var(--warning), var(--primary))';
    else fill.style.background = 'linear-gradient(90deg, var(--primary), var(--success))';
  }

  const days = daysToQuarterEnd();
  let msg = t('qm_loading');
  if (pctNum != null) {
    if (pctNum >= 100) msg = t('qm_done', { pct: pctNum });
    else if (pctNum >= 80) msg = t('qm_high', { left: 100 - pctNum, remaining: totals.remaining || '—' });
    else if (pctNum >= 50) msg = t('qm_mid', { days });
    else msg = t('qm_low', { days });
  }
  document.getElementById('qsMotivation').innerHTML = msg;
}

function renderDynamics(months) {
  months = months || {};
  const order = [
    ['january', t('monthJanShort')],
    ['february', t('monthFebShort')],
    ['march', t('monthMarShort')],
  ];
  const data = order.map(([key, label]) => {
    const m = months[key] || {};
    return { label, fact: parseMoney(m.fact || ''), factStr: m.fact || '—', pct: Number(m.percent || 0) };
  });
  const max = Math.max(...data.map(d => d.fact), 1);

  const rows = document.getElementById('dynamicsRows');
  rows.innerHTML = data.map(d => {
    const width = max > 0 ? Math.max(8, (d.fact / max) * 100) : 8;
    let color = 'var(--danger)';
    if (d.pct >= 100) color = 'var(--success)';
    else if (d.pct >= 50) color = 'var(--warning)';
    return `
      <div class="dynamics-row">
        <div class="dynamics-month">${d.label}</div>
        <div class="dynamics-bar">
          <div class="dynamics-bar-fill" style="width: ${width}%; background: ${color};">${d.pct}%</div>
        </div>
        <div class="dynamics-amount">${escapeHtml(d.factStr)}</div>
      </div>`;
  }).join('');

  const card = document.getElementById('dynamicsCard');
  const allZero = data.every(d => d.fact === 0);
  if (allZero) { card.style.display = 'none'; return; }
  card.style.display = '';

  const insight = document.getElementById('dynamicsInsight');
  const first = data[0].fact, last = data[data.length - 1].fact;
  if (last > first && first > 0) {
    const growth = Math.round(((last - first) / first) * 100);
    insight.innerHTML = t('di_grow', { n: growth });
  } else if (last > 0 && first > 0 && last < first) {
    insight.innerHTML = t('di_drop');
  } else if (data.every(d => d.pct >= 100)) {
    insight.innerHTML = t('di_top');
  } else {
    insight.innerHTML = t('di_stable');
  }
}

function renderMonths(months) {
  months = months || {};
  const order = [
    ['january', t('monthJan')],
    ['february', t('monthFeb')],
    ['march', t('monthMar')],
  ];
  const grid = document.getElementById('monthsGrid');
  grid.innerHTML = order.map(([key, label]) => {
    const m = months[key] || {};
    const p = Number(m.percent || 0);
    const color = p >= 100 ? 'var(--success)' : p >= 50 ? 'var(--warning)' : 'var(--danger)';
    return `
      <div class="month-card">
        <div class="month-header">${label}</div>
        <div class="month-body">
          <div class="month-row">
            <div class="month-row-label">${t('monthFact')}</div>
            <div class="month-row-value" style="color: ${p >= 100 ? 'var(--success)' : 'var(--text-primary)'};">${escapeHtml(m.fact || '—')}</div>
          </div>
          <div class="month-row">
            <div class="month-row-label">${t('monthPlan')}</div>
            <div class="month-row-value">${escapeHtml(m.plan || '—')}</div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(p, 100)}%; background: ${color};"></div>
          </div>
          <div class="month-percent">${p}%</div>
        </div>
      </div>`;
  }).join('');
}

function renderBonuses(bonuses) {
  bonuses = bonuses || {};
  const items = [
    { key: 'accrued',   labelKey: 'bonus_accrued_label',   descKey: 'bonus_accrued_desc',   icon: '✓', cls: 'bonus-yellow', color: 'var(--success)' },
    { key: 'potential', labelKey: 'bonus_potential_label', descKey: 'bonus_potential_desc', icon: '+', cls: 'bonus-blue',   color: 'var(--info)',    highlight: true },
    { key: 'completed', labelKey: 'bonus_completed_label', descKey: 'bonus_completed_desc', icon: '◉', cls: 'bonus-green',  color: 'var(--primary)' },
  ];
  const grid = document.getElementById('bonusGrid');
  grid.innerHTML = items.map(it => {
    const b = bonuses[it.key] || {};
    const amount = b.amount || '—';
    const desc = b.desc || t(it.descKey);
    const badge = it.highlight && parseMoney(amount) > 0 ? `<div class="bonus-badge">${t('bonus_potential_badge')}</div>` : '';
    const cardCls = it.highlight && parseMoney(amount) > 0 ? 'bonus-card highlight' : 'bonus-card';
    return `
      <div class="${cardCls}">
        <div class="bonus-icon ${it.cls}">${it.icon}</div>
        <div class="bonus-content">
          <div class="bonus-label">${t(it.labelKey)}</div>
          <div class="bonus-amount" style="color: ${it.color};">${escapeHtml(amount)}</div>
          <div class="bonus-desc">${escapeHtml(desc)}</div>
          ${badge}
        </div>
      </div>`;
  }).join('');
}

function renderProjects() {
  const list = document.getElementById('projList');
  let filtered = allProjects;
  if (currentFilter !== 'all') filtered = filtered.filter(p => p.status === currentFilter);
  if (currentSearch) filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(currentSearch));
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">😔</div><div>${t('emptyProjects')}</div></div>`;
    return;
  }
  list.innerHTML = filtered.map(p => {
    const pct = Number(p.percent || 0);
    const cls = pct >= 100 ? 'pct-success' : pct >= 50 ? 'pct-warning' : 'pct-danger';
    const bonusVal = parseMoney(p.bonus_amount || '0');
    const factVal = parseMoney(p.fact || '0');
    const planVal = parseMoney(p.quarter_plan || p.plan || '0');
    let lostBlock = '';
    if (pct < 100 && bonusVal > 0 && planVal > 0) {
      const lostShare = Math.max(0, (1 - factVal / planVal)) * bonusVal;
      if (lostShare > 0) lostBlock = `<div class="project-lost">${t('projectLost', { amount: formatMoney(lostShare) })}</div>`;
    }
    return `
      <div class="project-row" onclick="showProjectProducts('${escapeHtml(p.name).replace(/'/g, "\\'")}')">
        <div class="project-name">${escapeHtml(p.name)}</div>
        <div class="project-plan">${escapeHtml(p.quarter_plan || p.plan || '—')}</div>
        <div class="project-fact">${escapeHtml(p.fact || '—')}</div>
        <div class="project-percent ${cls}">${pct}%</div>
        <div class="project-bonus">${escapeHtml(p.bonus_amount || '0')}</div>
        ${lostBlock}
      </div>`;
  }).join('');
}

function renderStickyCta(d) {
  const bonuses = d.bonuses || {};
  const potential = parseMoney((bonuses.potential && bonuses.potential.amount) || '');
  const accrued = parseMoney((bonuses.accrued && bonuses.accrued.amount) || '');
  const lost = Math.max(0, potential - accrued);
  const sticky = document.getElementById('stickyCta');
  const text = document.getElementById('stickyText');
  if (lost > 0) {
    text.textContent = t('stickyText', { amount: formatMoney(lost) });
    setTimeout(() => sticky.classList.add('visible'), 2500);
  } else {
    sticky.classList.remove('visible');
  }
}

function renderDeadline() {
  setText('#daysLeft', daysToQuarterEnd());
}

// CTA: показать модалку контактов менеджера
window.contactManager = function() {
  const d = (window.userData && window.userData.pharmacies && window.userData.pharmacies[0]
    && window.userData.pharmacies[0].dashboard) || {};
  const name = d.manager || '';
  const phone = (d.manager_phone || '').trim();
  const username = (d.manager_username || '').trim().replace(/^@/, '');

  setText('#mgrName', name || 'DATFO');
  setText('#mgrRole', t('mgrRole'));
  setText('#mgrHint', t('mgrHint'));

  const actions = document.getElementById('mgrActions');
  const items = [];

  if (phone) {
    const telHref = 'tel:' + phone.replace(/[^\d+]/g, '');
    items.push(`
      <a class="mgr-action" href="${escapeHtml(telHref)}" onclick="openExternal('${escapeHtml(telHref)}', event)">
        <div class="mgr-action-icon phone">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
        </div>
        <div class="mgr-action-text">
          <div class="mgr-action-label">${escapeHtml(t('mgrPhone'))}</div>
          <div class="mgr-action-value">${escapeHtml(phone)}</div>
        </div>
        <div class="mgr-action-arrow">›</div>
      </a>`);
  }

  if (username) {
    const tgHref = 'https://t.me/' + username;
    items.push(`
      <a class="mgr-action" onclick="openTg('${escapeHtml(username)}', event)">
        <div class="mgr-action-icon tg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"></path></svg>
        </div>
        <div class="mgr-action-text">
          <div class="mgr-action-label">${escapeHtml(t('mgrTelegram'))}</div>
          <div class="mgr-action-value">@${escapeHtml(username)}</div>
        </div>
        <div class="mgr-action-arrow">›</div>
      </a>`);
  }

  // Если ни телефона, ни telegram у менеджера нет — показываем подсказку
  if (items.length === 0) {
    items.push(`
      <div class="mgr-action" style="cursor:default; opacity:0.7;">
        <div class="mgr-action-icon" style="background:var(--bg-secondary);color:var(--text-muted);">i</div>
        <div class="mgr-action-text">
          <div class="mgr-action-value" style="font-weight:500;font-size:13px;color:var(--text-secondary);">${escapeHtml(t('mgrNoContacts'))}</div>
        </div>
      </div>`);
  }

  actions.innerHTML = items.join('');
  document.getElementById('mgrOverlay').classList.add('active');
};

window.closeManager = function(e) {
  if (e && e.target && e.target.id !== 'mgrOverlay' && !e.target.classList.contains('mgr-close')) return;
  document.getElementById('mgrOverlay').classList.remove('active');
};

window.openExternal = function(url, e) {
  if (e) e.preventDefault();
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.openLink) tg.openLink(url);
  else window.location.href = url;
};

window.openTg = function(username, e) {
  if (e) e.preventDefault();
  const link = 'https://t.me/' + username;
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.openTelegramLink) tg.openTelegramLink(link);
  else if (tg && tg.openLink) tg.openLink(link);
  else window.open(link, '_blank');
};


window.showProjectProducts = function(projectName) {
  const tg = window.Telegram && window.Telegram.WebApp;
  const msg = t('productsStub', { name: projectName });
  if (tg && tg.showAlert) tg.showAlert(msg);
  else alert(msg);
};

function renderError(msg) {
  const container = document.querySelector('.container');
  const div = document.createElement('div');
  div.className = 'card';
  div.style.cssText = 'border-color: var(--danger); background: rgba(239,68,68,0.05);';
  div.innerHTML = `
    <div style="font-size:14px;font-weight:800;color:var(--danger);margin-bottom:6px;">${t('errPrefix')}</div>
    <div style="font-size:13px;color:var(--text-secondary);">${escapeHtml(msg)}</div>`;
  container.insertBefore(div, container.firstChild);
}

// ============================================================
// ONBOARDING TOUR
// ============================================================
const tourStepsConfig = [
  { selector: '.hero-earned',   titleKey: 'tour_earned_t',   textKey: 'tour_earned' },
  { selector: '#heroLost',      titleKey: 'tour_lost_t',     textKey: 'tour_lost' },
  { selector: '#deadlineBadge', titleKey: 'tour_deadline_t', textKey: 'tour_deadline' },
  { selector: '.stats-grid',    titleKey: 'tour_stats_t',    textKey: 'tour_stats' },
  { selector: '#dynamicsCard',  titleKey: 'tour_dyn_t',      textKey: 'tour_dyn' },
  { selector: '#bonusGrid',     titleKey: 'tour_bonus_t',    textKey: 'tour_bonus' },
  { selector: '#projList',      titleKey: 'tour_proj_t',     textKey: 'tour_proj' },
  { selector: '.cta-manager',   titleKey: 'tour_cta_t',      textKey: 'tour_cta' },
];
let tourIndex = 0;
window.tourShowWelcome = function() { document.getElementById('tourWelcome').classList.add('active'); };
function tourHideWelcome() { document.getElementById('tourWelcome').classList.remove('active'); }
window.tourStart = function() { tourHideWelcome(); tourIndex = 0; document.getElementById('tourOverlay').classList.add('active'); tourRender(); };
window.tourFinish = function() {
  tourHideWelcome();
  document.getElementById('tourOverlay').classList.remove('active');
  try { localStorage.setItem('datfo_tour_done', '1'); } catch (e) {}
};
window.tourNext = function() { if (tourIndex < tourStepsConfig.length - 1) { tourIndex++; tourRender(); } else { tourFinish(); } };
window.tourPrev = function() { if (tourIndex > 0) { tourIndex--; tourRender(); } };
function tourRender() {
  const step = tourStepsConfig[tourIndex];
  const el = document.querySelector(step.selector);
  if (!el) { window.tourNext(); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const sp = document.getElementById('tourSpotlight');
    sp.style.top = (rect.top - pad) + 'px';
    sp.style.left = (rect.left - pad) + 'px';
    sp.style.width = (rect.width + pad*2) + 'px';
    sp.style.height = (rect.height + pad*2) + 'px';
    document.getElementById('tourTitle').textContent = t(step.titleKey);
    document.getElementById('tourText').textContent = t(step.textKey);
    document.getElementById('tourProgress').textContent = t('tourStep', { n: tourIndex + 1, total: tourStepsConfig.length });
    document.getElementById('tourPrevBtn').style.visibility = tourIndex === 0 ? 'hidden' : 'visible';
    document.getElementById('tourNextBtn').textContent = tourIndex === tourStepsConfig.length - 1 ? t('tourDone') : t('tourNext');
    const tt = document.getElementById('tourTooltip');
    const vh = window.innerHeight, vw = window.innerWidth;
    let top = rect.bottom + 14;
    if (top + tt.offsetHeight + 20 > vh) top = Math.max(12, rect.top - tt.offsetHeight - 14);
    if (top < 12) top = 12;
    let left = Math.max(12, Math.min(vw - tt.offsetWidth - 12, rect.left + rect.width/2 - tt.offsetWidth/2));
    tt.style.top = top + 'px';
    tt.style.left = left + 'px';
  }, 350);
}
window.addEventListener('resize', () => { if (document.getElementById('tourOverlay').classList.contains('active')) tourRender(); });
window.addEventListener('load', () => {
  setTimeout(() => {
    try {
      if (userData && userData.is_admin) return; // admins skip the welcome tour
      if (!localStorage.getItem('datfo_tour_done')) window.tourShowWelcome();
    } catch (e) { window.tourShowWelcome(); }
  }, 800);
});

// ============================================================
// UTILS
// ============================================================
function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el && value != null) el.textContent = value;
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function parseMoney(str) {
  if (str == null) return 0;
  const s = String(str).trim().replace(/\s/g, '').replace(',', '.').toUpperCase();
  if (!s || s === '—' || s === '-') return 0;
  const num = parseFloat(s);
  if (isNaN(num)) return 0;
  if (s.includes('M')) return num * 1_000_000;
  if (s.includes('K') || s.includes('К')) return num * 1_000;
  return num;
}
function formatMoney(n) {
  // "10 000 000" — полные цифры с пробелом-разделителем
  return Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ').replace(/ /g, ' ');
}
function daysToQuarterEnd() {
  const now = new Date();
  const m = now.getMonth();
  const q = Math.floor(m / 3);
  const lastMonth = q * 3 + 2;
  const end = new Date(now.getFullYear(), lastMonth + 1, 0);
  end.setHours(23, 59, 59, 999);
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}
