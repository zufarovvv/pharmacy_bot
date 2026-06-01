// ============================================================
// DATFO Dashboard — клиентская логика. Bilingual (RU/UZ).
// ============================================================

const API_BASE = window.location.origin;
let userData = null;
let currentPharm = null;     // Полные данные аптеки, чей дашборд сейчас открыт
let currentPharmInn = null;  // ИНН аптеки, на которую сейчас смотрим (для трекинга)
let allProjects = [];
let currentFilter = 'all';
let currentSearch = '';
let currentLang = 'ru';
// Admin state
let adminPharmacies = [];
let adminManagers = [];
let adminSearch = '';
let adminFilter = 'all';
let adminTab = 'pharms'; // 'pharms' | 'managers' | 'activity'
let adminMgrFilter = null; // имя менеджера для фильтра аптек
let activityPeriodDays = 7;
let activityCache = null;
let mgrSort = 'avg_pct'; // 'avg_pct' | 'pharm_count' | 'bonus' | 'completed' | 'critical'

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
    statsWin: 'Закрыто',
    statsWinDesc: 'план выполнен',
    statsAlmost: 'В работе',
    statsAlmostDesc: 'ускорить',
    statsRisk: 'Отстают',
    statsRiskDesc: 'нужно действовать',
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
    pctLabel: 'из плана',
    loaderHint: 'Загружаем данные...',
    bizHeroEarnedYou: 'ВЫ ЗАРАБОТАЛИ С DATFO',
    bizHeroEarnedSubGrowth: 'за {n} мес · рост +{pct}% к началу',
    bizHeroEarnedSubFlat: 'за {n} мес работы',
    bizHeroMonthAvg: 'Средний доход в месяц',
    bizHeroCould: 'А могли ещё +{amount} {money} →',
    bizSecEarned: 'УЖЕ ЗАРАБОТАЛИ',
    bizSecRevenue: 'ПРОДАЖИ ЗА КВАРТАЛ',
    bizSecPotential: 'ДОПОЛНИТЕЛЬНЫЙ БОНУС',
    bizSecRevenueShort: 'ПРОДАЖИ',
    adviceTitle: 'Совет от FOM',
    adviceSectionTitle: 'РЕКОМЕНДАЦИИ',
    adviceCompetitorTitle: 'Замените {comp} на {prod}',
    adviceCompetitorReason: 'Вы продаёте <b>{comp}</b> ({brand}) — это аналог <b>{prod}</b> ({project}). {reason}',
    advicePlanTitle: 'Закройте план {project}',
    advicePlanReason: 'Проект <b>{project}</b> выполнен на <b>{pct}%</b>. Закажите <b>{n} упак.</b> <b>{prod}</b> до конца квартала — закроете план и заберёте полный бонус.',
    adviceMarginTitle: 'Высокая маржа на {prod}',
    adviceMarginReason: '<b>{prod}</b> ({project}) даёт маржу <b>+{margin}%</b> — одну из самых высоких в портфеле. Увеличьте заказ — увеличите прибыль.',
    adviceBenefit1: '+{amount} {money} за квартал',
    adviceBenefitMargin: 'Маржа +{n}%',
    adviceBenefitBonus: 'Бонус DATFO {n}%',
    adviceBenefitPlan: 'Закрытие плана 100%',
    adviceCta: 'Узнать у менеджера →',
    faqTitle: 'Вопросы',
    faqSub: 'Быстрые ответы на частые вопросы',
    faqSearch: 'Найти вопрос...',
    faqStartTour: '▶ Запустить ознакомительный тур',
    faqCloseApp: '✕ Закрыть приложение',
    faqEmpty: 'Ничего не найдено по вашему запросу',
    faqModeQuick: 'Быстрые ответы',
    faqModeAi: '✦ Спросить AI',
    aiWelcomeTitle: 'AI-ассистент DATFO',
    aiWelcomeSub: 'Задавайте вопросы о ваших данных, бонусах, проектах. Отвечу с учётом вашей аптеки.',
    aiInputPlaceholder: 'Задайте вопрос...',
    aiErrorDisabled: 'AI-ассистент пока не настроен. Используйте «Быстрые ответы».',
    aiErrorGeneric: 'Не удалось получить ответ. Попробуйте ещё раз через минуту.',
    aiSuggestions: ['Сколько я заработал?', 'Что мне сейчас невыгодно?', 'Как закрыть план?', 'Что заказать сегодня?'],
    promoEyebrow: 'УПУЩЕННАЯ ВЫГОДА',
    promoCtaText: 'Связаться с менеджером',
    promoSkip: 'Не сейчас',
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
    tabPharms: 'Аптеки',
    tabManagers: 'Менеджеры',
    tabActivity: 'Активность',
    activitySubtitle: 'за {days} дн.',
    mgrSumAll: 'Менеджеров',
    mgrSumAvg: 'Средний %',
    mgrSumBest: 'Лучший',
    mgrSortLabel: 'Сортировка:',
    mgrSortAvg: 'По % плана',
    mgrSortPharms: 'По аптекам',
    mgrSortBonus: 'По бонусу',
    mgrSortCompleted: 'По выполненным',
    mgrSortCritical: 'По риску',
    mgrLegCompleted: 'Выполнили',
    mgrLegPartial: 'В работе',
    mgrLegCritical: 'Риск',
    prodSub: 'Продукция проекта · {n} товаров',
    prodHeroSub: 'в квартал — потенциал по <b>{n}</b> товарам, которые вы не закупаете',
    prodHeroAllGood: '✓ Вы участвуете во всех товарах',
    prodHeroAllGoodSub: 'Молодцы — не упускаете ни одного бонуса',
    prodStatActive: 'Активно',
    prodStatTried: 'Пробовали',
    prodStatMissed: 'Упускаете',
    prodBadgeActive: 'В работе',
    prodBadgeTried: 'Пробовали',
    prodBadgeMissed: 'Нет в портфеле',
    prodCtaSub: 'бонус за квартал при выходе на план',
    prodActiveMeta: '<b>~{n} уп/мес</b> · бонус {amount} {money}/кв',
    prodTriedMeta: 'Потенциал к восстановлению: <b>{amount} {money}/кв</b>',
    prodFinalCta: 'Заказать у менеджера · {amount} {money}',
    prodFinalCtaNeutral: 'Связаться с менеджером',
    prodPeerMissed: '<b>{buying} из {total}</b> аптек района продают этот товар — вы упускаете долю рынка',
    prodPeerOccasional: 'Лидеры района заказывают <b>~{top} уп/мес</b> · вы {my}',
    prodPeerActive: 'Вы в <b>топ-{rank}</b> из {region} аптек района по этому товару',
    prodLabelWholesale: 'Закуп',
    prodLabelRetail: 'Розница',
    prodLabelMargin: 'Маржа',
    prodLabelProfit: 'Прибыль с уп.',
    prodActionAdd: 'Добавить в портфель',
    prodActionScale: 'Увеличить заказ',
    prodActionKeep: 'Сохранить темп',
    activityKpiTotal: 'Всего действий',
    activityKpiUsers: 'Активных юзеров',
    activityByType: 'По типам',
    activityTopPharm: 'Топ аптек',
    activityTopUsers: 'Топ юзеров (tg_id)',
    activityPeriod7: '7 дней',
    activityPeriod30: '30 дней',
    activityPeriod90: '90 дней',
    activityEmpty: 'Пока нет событий за этот период',
    activityLoading: 'Загрузка...',
    evtAppOpen: 'Открытие приложения',
    evtTabSwitch: 'Смена вкладки',
    evtPharmacyOpen: 'Открытие аптеки',
    evtManagerOpen: 'Открытие менеджера',
    evtProjectClick: 'Клик по проекту',
    evtContactManager: 'Связь с менеджером',
    evtPhoneClick: 'Клик по телефону',
    evtTgClick: 'Клик по Telegram',
    evtAlertBarClick: 'Клик по алерту',
    evtPromoShown: 'Показ промо',
    evtPromoCta: 'Промо: CTA',
    evtPromoSkip: 'Промо: пропуск',
    evtLanguageSwitch: 'Смена языка',
    evtTourStarted: 'Тур: старт',
    evtTourFinished: 'Тур: финиш',
    evtTourSkipped: 'Тур: пропуск',
    evtManagerFilterClear: 'Снять фильтр менеджера',
    mgrStatTotal: 'Аптек',
    mgrStatCompleted: 'План',
    mgrStatPartial: 'Работа',
    mgrStatCritical: 'Риск',
    mgrAvgLabel: 'средний %',
    mgrBonusLabel: 'Общий бонус:',
    adminMgrSubtitle: '{n} менеджеров',
    mgrFilterChip: 'Аптеки менеджера: {name}',
  },
  uz: {
    deadline: 'Chorak oxirigacha',
    days: 'kun',
    earnedLabel: 'Chorak daromadi',
    earnedSub: "so'm · bonus",
    earnedDone: 'Rejani yopdingiz — bonus sizniki',
    earnedAlmost: 'Marra yaqin — rejani yopib oling',
    lostTitle: 'Olish mumkin',
    lostCTA: "Menejer bilan gaplashish",
    lostText_low: "Reja — <b>{pct}%</b>. Chorak yopilishiga <b>{days} kun</b> qoldi. Menejerga yozing — u qaysi mahsulotlarni olish kerakligini aytadi.",
    lostText_mid: "Siz <b>{pct}%</b>dasiz. To'liq bonusgacha biroz qoldi. Yana <b>{days} kun</b> bor.",
    lostText_high: "Reja yopildi. Endi qaytadan ortiqcha bajarsangiz — <b>qo'shimcha bonus</b>. Menejer bilan gaplashing.",
    spGold: '<b>Gold</b> dorixonalar rejani o\'rtacha <b>112%</b> yopadi. Tempni ushlang — yetakchilar qatorida turing.',
    spSilver: "<b>Silver</b>dan <b>Gold</b>ga o'tgan dorixonalar <b>2,3 marta ko'p</b> topadi. Keyingi pog'ona sizga ochiq.",
    statsWin: "Yopildi",
    statsWinDesc: 'reja yopildi',
    statsAlmost: 'Ishda',
    statsAlmostDesc: 'tezroq harakatlaning',
    statsRisk: "Ortda",
    statsRiskDesc: "harakat kerak",
    quarterTitle: 'Chorak natijasi',
    quarterSub: "Foiz qancha katta — to'lov shuncha ko'p",
    quarterPlan: 'Chorak rejasi',
    quarterDone: 'Bajarildi',
    qm_loading: "Ma'lumotlar yuklanmoqda...",
    qm_done: "<b>Reja yopildi.</b> Chorak — {pct}%. Bonus tayyor.",
    qm_high: "<b>Marra yaqin.</b> To'liq bonusgacha {left}% qoldi. <b>{remaining}</b> buyurtma bering — reja yopiladi.",
    qm_mid: "<b>Yarim yo'ldasiz.</b> Chorak oxirigacha {days} kun — 100% ga chiqishga yetadi.",
    qm_low: "<b>Tezroq harakat kerak.</b> Chorak oxirigacha {days} kun. Menejerga yozing — u eng muhim mahsulotlarni tanlab beradi.",
    dynamicsTitle: "Daromad o'sishi",
    dynamicsSub: "Oydan-oyga solishtiring",
    di_grow: "<b>Daromadingiz chorakda {n}% oshdi.</b> Barqaror o'sish — yaxshi belgi.",
    di_drop: "<b>Oxirgi oyda daromad pasaydi.</b> Menejerga yozing, birga to'g'rilaymiz.",
    di_top: "<b>Har oyda 100%+.</b> Siz DATFOning eng yaxshilari qatorida.",
    di_stable: "<b>Barqarorlik — pulning asosi.</b> Har oy reja yopilsin — har oy to'liq bonus.",
    monthsTitle: "Oylar bo'yicha",
    monthsSub: "Har yopilgan oy — hisobingizga pul",
    monthJan: 'Yanvar', monthFeb: 'Fevral', monthMar: 'Mart',
    monthJanShort: 'Yan', monthFebShort: 'Fev', monthMarShort: 'Mar',
    monthFact: 'Sotildi', monthPlan: 'Reja',
    bonusTitle: 'Bonuslar',
    bonusSub: "DATFO loyihalari uchun to'lovlar",
    bonus_accrued_label: 'Topildi',
    bonus_accrued_desc: 'Kafolatli summa — sizniki',
    bonus_potential_label: 'Potensial',
    bonus_potential_desc: "Chorak oxirigacha reja yopilsa — qo'shimcha bonus",
    bonus_potential_badge: 'Olish mumkin',
    bonus_completed_label: "To'langan",
    bonus_completed_desc: 'Hisobingizga tushdi',
    projectsTitle: 'Faol loyihalar',
    projectsSub: "Loyihaga bosing — mahsulotlarni ko'ring",
    searchPlaceholder: 'Loyiha izlash',
    filterAll: 'Hammasi',
    filterCompleted: "Yopildi",
    filterPartial: 'Ishda',
    filterCritical: "Ortda qolyapti",
    th_project: 'Loyiha', th_plan: 'Reja', th_fact: 'Sotildi', th_bonus: 'Bonus',
    projectLost: "Reja yopilsa yana <b>{amount}</b> so'm olasiz",
    emptyProjects: 'Loyiha topilmadi',
    loadingProjects: 'Loyihalar yuklanmoqda...',
    ctaTitle: 'Maslahat kerakmi?',
    ctaText: "Menejeringiz aynan sizning dorixonangizga foydali loyihalarni tanlab beradi.",
    ctaBtn: "Menejer bilan gaplashish",
    stickyText: "Olish mumkin: {amount} so'm",
    welcomeTitle: 'DATFOga xush kelibsiz!',
    welcomeText: "30 soniyada DATFO bilan ko'proq topish yo'lini ko'rsatamiz.",
    welcomeSkip: "O'tkazib yuborish",
    welcomeStart: 'Boshlash →',
    tourSkip: "O'tkazib yuborish",
    tourNext: 'Keyingi →',
    tourDone: 'Tayyor ✓',
    tourStep: '{n} / {total} QADAM',
    tour_earned_t: '💰 Daromadingiz', tour_earned: 'Chorak davomida topgan bonusingiz. Bu — hamyoningizdagi pul.',
    tour_lost_t: '🔥 Boy berayotgan foyda', tour_lost: "Chorak oxirigacha reja yopilsa, yana qancha olishingiz mumkin.",
    tour_deadline_t: '⏳ Muddat', tour_deadline: "Chorak oxirigacha qancha kun qoldi. Keyin bonus yonib ketadi.",
    tour_stats_t: "🎯 Loyihalar holati", tour_stats: "Yopildi — bonus sizniki. Ishda — tezlashtiring. Ortda — pulni boy berasiz.",
    tour_dyn_t: "📈 Daromad o'sishi", tour_dyn: "Daromadingiz oydan-oyga qanday o'sayotganini ko'ring. Yetakchilarni quvib eting.",
    tour_bonus_t: '🎁 Bonuslar', tour_bonus: "Topildi — sizniki. Potensial — olish mumkin. To'langan — hisobda.",
    tour_proj_t: '📋 Loyihalar', tour_proj: "Bosib oching — qaysi mahsulot olib reja yopilishini ko'rasiz.",
    tour_cta_t: "📞 Menejer aloqada", tour_cta: "Nimadan boshlashni bilmaysizmi? Menejer eng foydali loyihalarni tanlab beradi.",
    contactManager: "Menejeringizga yozing:\n\n👤 {name}\n\nU daromadingizni oshirishga va foydali loyihalarni topishga yordam beradi.",
    contactManagerNoName: "Bot orqali DATFO menejeriga yozing.\nU daromadingizni oshirishga yordam beradi.",
    mgrRole: 'Shaxsiy menejeringiz',
    mgrHint: "Telefon yoki Telegram orqali yozing — menejer javob beradi.",
    mgrPhone: 'Telefon',
    mgrTelegram: 'Telegram',
    mgrNoContacts: "Menejer aloqalari hali kiritilmagan. DATFO administratoriga yozing.",
    productsStub: "«{name}» loyiha mahsulotlari shu yerda chiqadi.\n\nExcel'dan integratsiya yakunlanmoqda.",
    pharmInnLabel: 'INN:',
    pharmManager: 'Menejer:',
    pharmPartner: '✓ DATFO sherigi',
    pctLabel: 'rejadan',
    loaderHint: 'Yuklanmoqda...',
    bizHeroEarnedYou: 'DATFO BILAN TOPDINGIZ',
    bizHeroEarnedSubGrowth: "{n} oyda · boshlanishidan +{pct}% oshdi",
    bizHeroEarnedSubFlat: "{n} oy birgalikda",
    bizHeroMonthAvg: "Oyiga o'rtacha",
    bizHeroCould: "Yana +{amount} {money} olishingiz mumkin →",
    bizSecEarned: 'ALLAQACHON TOPDINGIZ',
    bizSecRevenue: "CHORAK SOTUVI",
    bizSecPotential: "QO'SHIMCHA BONUS",
    bizSecRevenueShort: 'SOTUV',
    adviceTitle: 'FOM maslahati',
    adviceSectionTitle: 'MASLAHATLAR',
    adviceCompetitorTitle: "{comp} o'rniga {prod} oling",
    adviceCompetitorReason: "Siz <b>{comp}</b> ({brand}) sotyapsiz — bu <b>{prod}</b> ({project}) ning analogi. {reason}",
    advicePlanTitle: "{project} rejasini yoping",
    advicePlanReason: "<b>{project}</b> loyihasi <b>{pct}%</b>da. Chorak oxirigacha <b>{n} dona</b> <b>{prod}</b> oling — reja yopiladi, to'liq bonus sizniki.",
    adviceMarginTitle: "{prod}dan marja katta",
    adviceMarginReason: "<b>{prod}</b> ({project}) marjasi <b>+{margin}%</b> — portfeldagi eng yuqorilaridan. Buyurtmani oshiring — foyda ham ko'payadi.",
    adviceBenefit1: 'Chorakda +{amount} {money}',
    adviceBenefitMargin: 'Marja +{n}%',
    adviceBenefitBonus: 'DATFO bonusi {n}%',
    adviceBenefitPlan: 'Reja 100% yopiladi',
    adviceCta: "Menejerga yozish →",
    faqTitle: 'Savollar',
    faqSub: "Tez-tez beriladigan savollarga javoblar",
    faqSearch: 'Savolni izlash...',
    faqStartTour: "▶ Tanishtirishni boshlash",
    faqCloseApp: '✕ Ilovani yopish',
    faqEmpty: "Hech narsa topilmadi",
    faqModeQuick: 'Tezkor javoblar',
    faqModeAi: "✦ AI'dan so'rash",
    aiWelcomeTitle: 'DATFO AI-yordamchisi',
    aiWelcomeSub: "Ma'lumotlaringiz, bonus, loyihalar haqida so'rang. Dorixonangiz bilan javob beraman.",
    aiInputPlaceholder: "So'rang...",
    aiErrorDisabled: "AI-yordamchi sozlanmagan. «Tezkor javoblar»dan foydalaning.",
    aiErrorGeneric: "Javob kelmadi. Bir daqiqadan keyin urinib ko'ring.",
    aiSuggestions: ['Qancha topdim?', "Hozir nimasi yo'q?", "Rejani qanday yopaman?", "Bugun nimani olay?"],
    promoEyebrow: 'HAFTA TAKLIFI',
    promoCtaText: "Menejer bilan gaplashish",
    promoSkip: 'Hozir emas',
    noPharm: "Akkauntingizga dorixona biriktirilmagan. Menejerga yozing.",
    errLoad: "Ma'lumot yuklanmadi: ",
    errNoTg: "tg_id va initData yo'q. Bot orqali oching yoki URL ga ?tg_id=... qo'shing.",
    errPrefix: "⚠ Yuklash xatosi",
    footer: 'DATFO · Dorixona paneli · v5.0',
    adminTitle: 'Barcha dorixonalar',
    adminSubtitle: 'Tizimda — {n} ta dorixona',
    adminSearchPlaceholder: 'Qidirish: dorixona / INN / menejer',
    adminBack: "← Dorixonalar ro'yxatiga",
    adminEmpty: "Hech narsa topilmadi",
    adminMgr: 'Menejer:',
    adminInn: 'INN:',
    adminBonus: 'Bonus:',
    adminNoMgr: 'menejersiz',
    tabPharms: 'Dorixonalar',
    tabManagers: 'Menejerlar',
    tabActivity: 'Faollik',
    activitySubtitle: '{days} kun ichida',
    mgrSumAll: 'Menejerlar',
    mgrSumAvg: "O'rtacha %",
    mgrSumBest: 'Eng yaxshi',
    mgrSortLabel: 'Saralash:',
    mgrSortAvg: 'Reja %',
    mgrSortPharms: 'Dorixonalar soni',
    mgrSortBonus: 'Bonus',
    mgrSortCompleted: "Yopganlar",
    mgrSortCritical: "Ortda qolayotganlar",
    mgrLegCompleted: 'Yopdi',
    mgrLegPartial: 'Ishda',
    mgrLegCritical: 'Ortda',
    prodSub: 'Loyiha mahsulotlari · {n} ta',
    prodHeroSub: "chorakda — <b>{n}</b> ta mahsulotda potensial, siz hozircha olmayapsiz",
    prodHeroAllGood: '✓ Barcha mahsulotlarda ishtirokdasiz',
    prodHeroAllGoodSub: "Zo'r — bironta bonusni boy bermaysiz",
    prodStatActive: 'Faol',
    prodStatTried: "Sinab ko'rgan",
    prodStatMissed: 'Boy beryapsiz',
    prodBadgeActive: 'Ishda',
    prodBadgeTried: 'Sinab',
    prodBadgeMissed: "Portfelda yo'q",
    prodCtaSub: "Reja yopilsa — chorak bonusi",
    prodActiveMeta: "<b>~{n} dona/oy</b> · bonus {amount} {money}/chor",
    prodTriedMeta: "Qaytarish potensiali: <b>{amount} {money}/chor</b>",
    prodFinalCta: "Menejerga buyurtma · {amount} {money}",
    prodFinalCtaNeutral: "Menejer bilan gaplashish",
    prodPeerMissed: "Tumanda <b>{total} dorixonadan {buying} tasi</b> bu mahsulotni sotyapti — siz ortda qolyapsiz",
    prodPeerOccasional: "Tuman yetakchilari <b>~{top} dona/oy</b> oladi · sizda {my}",
    prodPeerActive: "Bu mahsulot bo'yicha {region} dorixonadan <b>top-{rank}</b>siz",
    prodLabelWholesale: 'Xarid',
    prodLabelRetail: 'Chakana',
    prodLabelMargin: 'Marja',
    prodLabelProfit: 'Donadan foyda',
    prodActionAdd: "Portfelga qo'shish",
    prodActionScale: 'Buyurtmani oshirish',
    prodActionKeep: 'Tempni saqlang',
    activityKpiTotal: 'Jami harakatlar',
    activityKpiUsers: 'Faol foydalanuvchilar',
    activityByType: "Turi bo'yicha",
    activityTopPharm: 'Top dorixonalar',
    activityTopUsers: 'Top foydalanuvchilar',
    activityPeriod7: '7 kun',
    activityPeriod30: '30 kun',
    activityPeriod90: '90 kun',
    activityEmpty: "Bu davrda harakat yo'q",
    activityLoading: 'Yuklanmoqda...',
    mgrStatTotal: 'Dorixona',
    mgrStatCompleted: 'Yopdi',
    mgrStatPartial: 'Ishda',
    mgrStatCritical: 'Ortda',
    mgrAvgLabel: "o'rtacha %",
    mgrBonusLabel: 'Umumiy bonus:',
    adminMgrSubtitle: '{n} ta menejer',
    mgrFilterChip: '{name} menejer dorixonalari',
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
  trackEvent('language_switch', { lang });
  currentLang = lang;
  try { localStorage.setItem('datfo_lang', lang); } catch (e) {}
  applyLang();
  // Перерисовать всё динамическое если данные уже загружены
  if (userData) render(userData);
  else renderDeadline();
  // Если открыт экран продукции — перерендериваем на новом языке
  const prodOverlay = document.getElementById('productsOverlay');
  if (prodOverlay && prodOverlay.classList.contains('active') && currentProductsProject) {
    window.showProjectProducts(currentProductsProject);
  }
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
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setBackgroundColor('#f8fafc');
    // BackButton: единый обработчик "стрелки назад" Telegram.
    // Когда открыта любая наша шторка — стрелка закрывает её.
    // Когда ничего не открыто — стрелка прячется, и обычный крестик Telegram
    // нормально закрывает Mini App.
    if (tg.BackButton && tg.BackButton.onClick) {
      tg.BackButton.onClick(() => {
        const active = getActiveOverlay();
        if (active && typeof active.close === 'function') {
          active.close();
        }
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();

// ============================================================
// TELEGRAM BACK-BUTTON INTEGRATION
// ============================================================
function getActiveOverlay() {
  // Порядок — от "верхнего" к "нижнему". Закрываем то, что наверху.
  const candidates = [
    { el: document.getElementById('promoOverlay'),    close: window.closePromo },
    { el: document.getElementById('mgrOverlay'),      close: () => window.closeManager && window.closeManager() },
    { el: document.getElementById('productsOverlay'), close: window.closeProducts },
    { el: document.getElementById('faqOverlay'),      close: window.closeFaq },
  ];
  for (const o of candidates) {
    if (o.el && o.el.classList && o.el.classList.contains('active')) return o;
  }
  return null;
}

function updateBackButton() {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (!tg || !tg.BackButton) return;
  try {
    if (getActiveOverlay()) tg.BackButton.show();
    else                    tg.BackButton.hide();
  } catch (e) { /* старый клиент Telegram — не поддерживает BackButton */ }
}

window.closeWebApp = function() {
  trackEvent('app_close', {});
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.close) tg.close();
};

async function main() {
  currentLang = detectLang();
  applyLang();
  setupFaqAutoHide();
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
  else { hideAppLoader(); renderError(t('errNoTg')); return; }

  try {
    const res = await fetch(url, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        ...(initData ? { 'X-Telegram-Init-Data': initData } : {})
      }
    });
    if (!res.ok) {
      const txt = await res.text();
      hideAppLoader();
      renderError(`API ${res.status}: ${txt}`);
      return;
    }
    userData = await res.json();
    window.userData = userData;
    hideAppLoader();
    trackEvent('app_open', {
      role: userData.role,
      is_admin: !!userData.is_admin,
      pharm_count: (userData.pharmacies || []).length,
      auth: userData.auth_source,
    });
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
    hideAppLoader();
    renderError(t('errLoad') + e.message);
  }
}

function hideAppLoader() {
  const loader = document.getElementById('appLoader');
  if (loader) {
    loader.classList.add('hide');
    setTimeout(() => { loader.style.display = 'none'; }, 300);
  }
}

// ============================================================
// RENDER
// ============================================================
function render(data) {
  // Admin: show list of all pharmacies first
  if (data.is_admin && Array.isArray(data.pharmacies) && data.pharmacies.length >= 1) {
    adminPharmacies = data.pharmacies;
    adminManagers = Array.isArray(data.managers) ? data.managers : [];
    showAdminList();
    return;
  }
  const pharm = (data.pharmacies && data.pharmacies[0]) || null;
  if (!pharm) { renderError(t('noPharm')); return; }
  renderDashboard(pharm);
}

function renderDashboard(pharm) {
  currentPharm = pharm;
  currentPharmInn = pharm.inn || null;
  const d = pharm.dashboard || {};
  const isAdmin = !!(window.userData && window.userData.is_admin);

  renderPharmacy(pharm, d);

  if (isAdmin) {
    // Админ/суперадмин смотрит чужую аптеку для контроля — никаких CTA для аптек.
    hidePharmacyTriggers();
  } else {
    renderAlertBar(d);
    // bizHero теперь показывает ИСТОРИЮ доходов (за 8 мес), а heroLost —
    // упущенную выгоду текущего квартала с CTA. Они дополняют друг друга,
    // больше не дубликат.
    renderLostOpportunity(d);
  }

  renderIncome(d);
  renderStats(d.stats);
  renderQuarter(d.totals);
  renderDynamics(d.totals && d.totals.months ? d.totals.months : d.months);
  renderMonths(d.totals && d.totals.months ? d.totals.months : d.months);
  renderBonuses(d.bonuses);

  allProjects = Array.isArray(d.projects) ? d.projects : [];
  renderProjects();
  renderAdvice(d, pharm.inn);

  if (!isAdmin) {
    // renderStickyCta() убран — дублирует bizHero и конфликтует с FAQ-кнопкой.
    const sticky = document.getElementById('stickyCta');
    if (sticky) sticky.classList.remove('visible');
    schedulePromo(d);
  }
}

function hidePharmacyTriggers() {
  // Прячем все продающие триггеры для админа: алерт-плашку, упущенную выгоду,
  // sticky-кнопку. Промо-модалка не назначается (schedulePromo не вызывается).
  const alertBar = document.getElementById('alertBar');
  if (alertBar) alertBar.style.display = 'none';
  const heroLost = document.getElementById('heroLost');
  if (heroLost) heroLost.style.display = 'none';
  const sticky = document.getElementById('stickyCta');
  if (sticky) sticky.classList.remove('visible');
  // На случай если промо уже на экране (быстрое переключение):
  const promo = document.getElementById('promoOverlay');
  if (promo) promo.classList.remove('active');
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
  applyAdminTab();
}

window.setAdminTab = function(tab) {
  if (tab !== 'pharms' && tab !== 'managers' && tab !== 'activity') return;
  adminTab = tab;
  trackEvent('tab_switch', { tab });
  applyAdminTab();
};

function applyAdminTab() {
  document.querySelectorAll('.admin-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === adminTab);
  });
  const pharmList = document.getElementById('adminPharmList');
  const mgrList = document.getElementById('adminMgrList');
  const activityView = document.getElementById('adminActivityView');
  const filters = document.getElementById('adminFiltersCard');
  const title = document.getElementById('adminSummaryTitle');
  const count = document.getElementById('adminCount');

  pharmList.style.display = 'none';
  mgrList.style.display = 'none';
  activityView.style.display = 'none';

  if (adminTab === 'managers') {
    mgrList.style.display = '';
    filters.style.display = 'none';
    title.textContent = t('tabManagers');
    count.textContent = t('adminMgrSubtitle', { n: adminManagers.length });
    renderAdminMgrList();
  } else if (adminTab === 'activity') {
    activityView.style.display = '';
    filters.style.display = 'none';
    title.textContent = t('tabActivity');
    count.textContent = t('activitySubtitle', { days: activityPeriodDays });
    loadAndRenderActivity();
  } else {
    pharmList.style.display = '';
    filters.style.display = '';
    title.textContent = t('adminTitle');
    count.textContent = t('adminSubtitle', { n: adminPharmacies.length });
    renderAdminList();
  }
}

window.clearMgrFilter = function() {
  trackEvent('manager_filter_clear', {});
  adminMgrFilter = null;
  document.getElementById('adminMgrFilterChip').style.display = 'none';
  renderAdminList();
};

window.filterByManager = function(name) {
  trackEvent('manager_open', { name });
  adminMgrFilter = name;
  adminTab = 'pharms';
  applyAdminTab();
  const chip = document.getElementById('adminMgrFilterChip');
  const txt = document.getElementById('adminMgrFilterText');
  txt.textContent = t('mgrFilterChip', { name: name });
  chip.style.display = '';
};

function showDashboardView(fromAdmin) {
  document.getElementById('adminListView').style.display = 'none';
  document.getElementById('dashboardView').style.display = '';
  document.getElementById('backToListBtn').style.display = fromAdmin ? '' : 'none';
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// Кэш полных данных по ИНН — чтобы не дёргать API повторно если уже открывали
const pharmacyFullCache = {};

window.selectPharmacy = async function(inn) {
  const slim = adminPharmacies.find(p => String(p.inn) === String(inn));
  if (!slim) return;
  trackEvent('pharmacy_open', { inn });

  // Если у slim уже есть полные данные (для обычного юзера) — используем напрямую
  const slimD = slim.dashboard || {};
  if (Array.isArray(slimD.projects)) {
    renderDashboard(slim);
    showDashboardView(true);
    return;
  }

  // Из кэша
  if (pharmacyFullCache[inn]) {
    renderDashboard(pharmacyFullCache[inn]);
    showDashboardView(true);
    return;
  }

  // Догружаем полные данные через отдельный эндпоинт
  showDashboardView(true);  // показываем экран с лоадер-стейтом
  showAppLoaderOverlay();   // короткий лоадер пока тянем
  try {
    const initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
    const urlParams = new URLSearchParams(window.location.search);
    const tgIdFromUrl = urlParams.get('tg_id');
    const url = new URL(API_BASE + '/api/pharmacy/' + encodeURIComponent(inn));
    if (initData) url.searchParams.set('init_data', initData);
    else if (tgIdFromUrl) url.searchParams.set('tg_id', tgIdFromUrl);

    const res = await fetch(url, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        ...(initData ? { 'X-Telegram-Init-Data': initData } : {}),
      },
    });
    if (!res.ok) throw new Error('API ' + res.status);
    const full = await res.json();
    pharmacyFullCache[inn] = full;
    renderDashboard(full);
  } catch (e) {
    console.error('[app.js] pharmacy full fetch failed:', e);
    // Фолбэк: показываем slim-версию (что-то покажется, без полных данных)
    renderDashboard(slim);
  } finally {
    hideAppLoader();
  }
};

function showAppLoaderOverlay() {
  const loader = document.getElementById('appLoader');
  if (loader) {
    loader.style.display = '';
    loader.classList.remove('hide');
  }
}

window.backToList = function() {
  showAdminList();
};

function renderAdminList() {
  const list = document.getElementById('adminPharmList');
  if (!list) return;

  let filtered = adminPharmacies.slice();
  if (adminMgrFilter) {
    filtered = filtered.filter(p => ((p.dashboard || {}).manager || '').trim() === adminMgrFilter);
  }
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

// ============================================================
// ACTIVITY DASHBOARD (вкладка "Активность")
// ============================================================
async function loadAndRenderActivity() {
  const root = document.getElementById('adminActivityView');
  root.innerHTML = renderActivityShell(null); // показываем shell с лоадером

  try {
    const initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
    const urlParams = new URLSearchParams(window.location.search);
    const tgIdFromUrl = urlParams.get('tg_id');
    const url = new URL(API_BASE + '/api/admin/stats');
    url.searchParams.set('days', String(activityPeriodDays));
    if (initData) url.searchParams.set('init_data', initData);
    else if (tgIdFromUrl) url.searchParams.set('tg_id', tgIdFromUrl);

    const res = await fetch(url, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        ...(initData ? { 'X-Telegram-Init-Data': initData } : {}),
      },
    });
    if (!res.ok) {
      root.innerHTML = renderActivityShell({ error: 'API ' + res.status });
      return;
    }
    activityCache = await res.json();
    root.innerHTML = renderActivityShell(activityCache);
  } catch (e) {
    root.innerHTML = renderActivityShell({ error: e.message });
  }
}

window.setActivityPeriod = function(days) {
  activityPeriodDays = days;
  document.getElementById('adminCount').textContent = t('activitySubtitle', { days });
  loadAndRenderActivity();
};

const EVENT_LABELS = {
  app_open: 'evtAppOpen',
  tab_switch: 'evtTabSwitch',
  pharmacy_open: 'evtPharmacyOpen',
  manager_open: 'evtManagerOpen',
  project_click: 'evtProjectClick',
  contact_manager: 'evtContactManager',
  phone_click: 'evtPhoneClick',
  tg_click: 'evtTgClick',
  alert_bar_click: 'evtAlertBarClick',
  promo_shown: 'evtPromoShown',
  promo_cta: 'evtPromoCta',
  promo_skip: 'evtPromoSkip',
  language_switch: 'evtLanguageSwitch',
  tour_started: 'evtTourStarted',
  tour_finished: 'evtTourFinished',
  tour_skipped: 'evtTourSkipped',
  manager_filter_clear: 'evtManagerFilterClear',
};

function labelForEvent(type) {
  const key = EVENT_LABELS[type];
  return key ? t(key) : type;
}

function renderActivityShell(stats) {
  const periodBtns = [7, 30, 90].map(d => `
    <button class="activity-period-btn ${activityPeriodDays === d ? 'active' : ''}" onclick="setActivityPeriod(${d})">${t('activityPeriod' + d)}</button>
  `).join('');

  if (stats === null) {
    return `
      <div class="activity-period">${periodBtns}</div>
      <div class="activity-empty">${t('activityLoading')}</div>
    `;
  }
  if (stats.error) {
    return `
      <div class="activity-period">${periodBtns}</div>
      <div class="activity-empty">⚠ ${escapeHtml(stats.error)}</div>
    `;
  }
  if (!stats.total) {
    return `
      <div class="activity-period">${periodBtns}</div>
      <div class="activity-empty">${t('activityEmpty')}</div>
    `;
  }

  const byType = (stats.by_type || []).map(r => `
    <div class="activity-row">
      <div class="activity-row-name">${escapeHtml(labelForEvent(r.event_type))}</div>
      <div class="activity-row-num">${r.count}</div>
    </div>
  `).join('');

  const topPharm = (stats.top_pharmacies || []).map(r => `
    <div class="activity-row">
      <div class="activity-row-name">${escapeHtml(r.name || r.inn)}</div>
      <div class="activity-row-num">${r.count}</div>
    </div>
  `).join('') || `<div class="activity-empty">—</div>`;

  const topUsers = (stats.top_users || []).map(r => `
    <div class="activity-row">
      <div class="activity-row-name"><code>${r.tg_id}</code></div>
      <div class="activity-row-num">${r.count}</div>
    </div>
  `).join('') || `<div class="activity-empty">—</div>`;

  return `
    <div class="activity-period">${periodBtns}</div>
    <div class="activity-kpis">
      <div class="activity-kpi">
        <div class="activity-kpi-label">${t('activityKpiTotal')}</div>
        <div class="activity-kpi-num">${stats.total}</div>
      </div>
      <div class="activity-kpi">
        <div class="activity-kpi-label">${t('activityKpiUsers')}</div>
        <div class="activity-kpi-num">${stats.active_users}</div>
      </div>
    </div>
    <div class="activity-section">
      <div class="activity-section-title">${t('activityByType')}</div>
      ${byType}
    </div>
    <div class="activity-section">
      <div class="activity-section-title">${t('activityTopPharm')}</div>
      ${topPharm}
    </div>
    <div class="activity-section">
      <div class="activity-section-title">${t('activityTopUsers')}</div>
      ${topUsers}
    </div>
  `;
}

window.setMgrSort = function(sortKey) {
  mgrSort = sortKey;
  renderAdminMgrList();
};

function sortedManagers() {
  const arr = adminManagers.slice();
  const dir = (a, b, key, fallback = -1) => {
    const av = a[key]; const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (bv - av) || ((a.pharm_count || 0) - (b.pharm_count || 0)) * fallback;
  };
  switch (mgrSort) {
    case 'pharm_count': arr.sort((a, b) => (b.pharm_count || 0) - (a.pharm_count || 0)); break;
    case 'bonus':       arr.sort((a, b) => (b.total_bonus_raw || 0) - (a.total_bonus_raw || 0)); break;
    case 'completed':   arr.sort((a, b) => (b.completed || 0) - (a.completed || 0)); break;
    case 'critical':    arr.sort((a, b) => (b.critical || 0) - (a.critical || 0)); break;
    case 'avg_pct':
    default:            arr.sort((a, b) => dir(a, b, 'avg_pct'));
  }
  return arr;
}

function rankBadgeClass(rank) {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return '';
}
function rankBadgeIcon(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '#' + rank;
}

function computeMgrSummary() {
  if (!adminManagers.length) return null;
  let pctSum = 0, pctN = 0;
  let best = null;
  for (const m of adminManagers) {
    if (m.avg_pct != null) {
      pctSum += m.avg_pct;
      pctN += 1;
      if (!best || (m.avg_pct > (best.avg_pct ?? -1))) best = m;
    }
  }
  return {
    total: adminManagers.length,
    avg: pctN ? Math.round(pctSum / pctN) : null,
    best: best,
  };
}

function renderAdminMgrList() {
  const list = document.getElementById('adminMgrList');
  if (!list) return;

  if (!adminManagers.length) {
    list.innerHTML = `<div class="empty-state" style="margin-top: 8px;"><div class="empty-state-icon">😔</div><div>${t('adminEmpty')}</div></div>`;
    return;
  }

  const summary = computeMgrSummary();
  const avgCls = summary.avg == null ? '' : summary.avg >= 100 ? 'pct-success' : summary.avg >= 50 ? 'pct-warning' : 'pct-danger';
  const bestName = summary.best ? escapeHtml(summary.best.name) : '—';
  const bestPct = summary.best && summary.best.avg_pct != null ? summary.best.avg_pct + '%' : '—';

  const sortBtns = [
    { key: 'avg_pct',      label: t('mgrSortAvg') },
    { key: 'pharm_count',  label: t('mgrSortPharms') },
    { key: 'bonus',        label: t('mgrSortBonus') },
    { key: 'completed',    label: t('mgrSortCompleted') },
    { key: 'critical',     label: t('mgrSortCritical') },
  ];

  const sorted = sortedManagers();

  const cardsHtml = sorted.map((m, idx) => {
    const rank = idx + 1;
    const avg = m.avg_pct;
    const avgCls = avg == null ? '' : avg >= 100 ? 'pct-success' : avg >= 50 ? 'pct-warning' : 'pct-danger';
    const avgText = avg == null ? '—' : avg + '%';
    const barFill = avg == null ? 0 : Math.min(avg, 100);
    const barColor = avg == null ? 'var(--text-muted)'
                                 : avg >= 100 ? 'var(--success)'
                                              : avg >= 50 ? 'var(--warning)'
                                                          : 'var(--danger)';
    const total = m.pharm_count || 0;
    const cPct = total ? (m.completed / total * 100) : 0;
    const pPct = total ? (m.partial   / total * 100) : 0;
    const rPct = total ? (m.critical  / total * 100) : 0;
    const nameSafe = escapeHtml(m.name).replace(/'/g, "\\'");
    const rankCls = rankBadgeClass(rank);
    const rankIco = rankBadgeIcon(rank);

    return `
      <div class="mgr-card" onclick="filterByManager('${nameSafe}')">
        <div class="mgr-card-head">
          <div class="mgr-card-name-row">
            <div class="mgr-rank ${rankCls}">${rankIco}</div>
            <div class="mgr-card-name">${escapeHtml(m.name)}</div>
          </div>
          <div class="mgr-card-avg ${avgCls}">${avgText}</div>
        </div>
        <div class="mgr-progress">
          <div class="mgr-progress-fill" style="width: ${barFill}%; background: ${barColor};"></div>
        </div>
        <div class="mgr-card-stats" style="margin-top: 10px;">
          <div class="mgr-stat s-total">
            <div class="mgr-stat-num">${total}</div>
            <div class="mgr-stat-label">${t('mgrStatTotal')}</div>
          </div>
          <div class="mgr-stat s-completed">
            <div class="mgr-stat-num">${m.completed}</div>
            <div class="mgr-stat-label">${t('mgrStatCompleted')}</div>
          </div>
          <div class="mgr-stat s-partial">
            <div class="mgr-stat-num">${m.partial}</div>
            <div class="mgr-stat-label">${t('mgrStatPartial')}</div>
          </div>
          <div class="mgr-stat s-critical">
            <div class="mgr-stat-num">${m.critical}</div>
            <div class="mgr-stat-label">${t('mgrStatCritical')}</div>
          </div>
        </div>
        <div class="mgr-stack">
          <div class="mgr-stack-seg completed" style="width: ${cPct}%;"></div>
          <div class="mgr-stack-seg partial"   style="width: ${pPct}%;"></div>
          <div class="mgr-stack-seg critical"  style="width: ${rPct}%;"></div>
        </div>
        <div class="mgr-stack-legend">
          <span class="leg"><span class="mgr-stack-dot completed"></span>${Math.round(cPct)}% ${t('mgrLegCompleted')}</span>
          <span class="leg"><span class="mgr-stack-dot partial"></span>${Math.round(pPct)}% ${t('mgrLegPartial')}</span>
          <span class="leg"><span class="mgr-stack-dot critical"></span>${Math.round(rPct)}% ${t('mgrLegCritical')}</span>
        </div>
        <div class="mgr-card-bonus">${t('mgrBonusLabel')} <b>${formatMoney(m.total_bonus_raw || 0)}</b></div>
      </div>`;
  }).join('');

  list.innerHTML = `
    <div class="mgr-summary">
      <div class="mgr-summary-box">
        <div class="mgr-summary-label">${t('mgrSumAll')}</div>
        <div class="mgr-summary-num">${summary.total}</div>
      </div>
      <div class="mgr-summary-box">
        <div class="mgr-summary-label">${t('mgrSumAvg')}</div>
        <div class="mgr-summary-num ${avgCls}">${summary.avg != null ? summary.avg + '%' : '—'}</div>
      </div>
      <div class="mgr-summary-box">
        <div class="mgr-summary-label">${t('mgrSumBest')}</div>
        <div class="mgr-summary-num pct-success" style="font-size: 16px;">${bestPct}</div>
        <div class="mgr-summary-sub">${bestName}</div>
      </div>
    </div>
    <div class="mgr-sort">
      <span>${t('mgrSortLabel')}</span>
      ${sortBtns.map(b => `
        <button class="mgr-sort-btn ${mgrSort === b.key ? 'active' : ''}" onclick="setMgrSort('${b.key}')">${b.label}</button>
      `).join('')}
    </div>
    <div style="margin-top: 12px;">${cardsHtml}</div>
  `;
}

function renderPharmacy(pharm, d) {
  setText('#pharmName', pharm.business || pharm.name || '—');
  // Компактная мета: регион · район · ИНН
  const meta = [];
  if (d.region) meta.push(d.region);
  if (d.district) meta.push(d.district);
  if (pharm.inn) meta.push('ИНН ' + pharm.inn);
  setText('#pharmMeta', meta.join(' · ') || '—');

  // Большой процент справа
  const pct = d.totals && d.totals.quarter_percent;
  const pctEl = document.getElementById('pharmPct');
  if (pct != null) {
    const n = Number(pct);
    pctEl.textContent = n + '%';
    pctEl.className = 'pharmacy-pct ' + (n >= 100 ? 'pct-success' : n >= 50 ? 'pct-warning' : 'pct-danger');
  } else {
    pctEl.textContent = '—';
    pctEl.className = 'pharmacy-pct';
  }

  // Тэги: оставляем только категорию (Gold/Silver) — без шумного "Partner"
  const tags = document.getElementById('pharmTags');
  tags.innerHTML = '';
  if (d.category) {
    const tag = document.createElement('span');
    const cat = d.category.toLowerCase();
    tag.className = 'tag ' + (cat === 'gold' ? 'tag-gold' : 'tag-silver');
    tag.textContent = '★ ' + d.category;
    tags.appendChild(tag);
  }
}

function renderIncome(d) {
  renderBizHero(d);
}

// История доходов за 8 месяцев — стабильный фейк по ИНН.
// Когда придёт реальный лист "История бонусов" — заменим эту функцию на чтение.
function generateEarningsHistory(inn, monthsCount) {
  const months = monthsCount || 8;
  const h = simpleHash((inn || 'demo') + ':earnings');
  // База — 400K..1.6M на первый месяц
  const base = 400000 + (h % 1200) * 1000;
  // Тренд: 0.94..1.18 в месяц (от лёгкого спада до уверенного роста)
  const trendBucket = (h >> 5) % 100;
  const monthlyTrend = trendBucket < 10 ? 0.94 + (trendBucket / 100)         // 10% — лёгкий спад
                     : trendBucket < 40 ? 0.98 + ((trendBucket - 10) / 300)  // 30% — флэт
                                        : 1.02 + ((trendBucket - 40) / 100); // остальное — рост
  const values = [];
  let cur = base;
  for (let i = 0; i < months; i++) {
    // Лёгкий шум 0.85..1.15 — чтобы не было идеальной прямой
    const noiseBucket = (h >> (i * 4)) & 0xff;
    const noise = 0.85 + (noiseBucket % 31) / 100;
    values.push(Math.round(cur * noise));
    cur *= monthlyTrend;
  }
  const total = values.reduce((a, b) => a + b, 0);
  const first = values[0];
  const last = values[values.length - 1];
  const growthPct = first > 0 ? Math.round((last - first) / first * 100) : 0;

  // "А могли ещё больше" — стабильный упущенный потенциал, 35-65% от заработанного.
  const h2 = simpleHash((inn || 'demo') + ':couldhave');
  const lossFactor = 0.35 + (h2 % 30) / 100;  // 0.35..0.65
  const couldHave = Math.round(total * lossFactor);

  return { values, total, months, growthPct, avg: Math.round(total / months), couldHave };
}

function renderSparkline(values, opts) {
  const o = opts || {};
  const width  = o.width  || 240;
  const height = o.height || 44;
  const stroke = o.stroke || '#065f46';
  const fill   = o.fill   || 'rgba(4,120,87,0.12)';
  if (!values || values.length < 2) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const padTop = 4;
  const usableH = height - padTop * 2;
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = padTop + usableH - ((v - min) / range) * usableH;
    return { x, y };
  });
  const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
  // Закрашенная область под линией
  const areaPath = linePath + ` L${width},${height} L0,${height} Z`;
  const dots = pts.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === pts.length-1 ? 3.5 : 2}" fill="${stroke}"/>`).join('');
  return `
    <svg class="bizhero-spark" width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <path d="${areaPath}" fill="${fill}" stroke="none"/>
      <path d="${linePath}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </svg>
  `;
}

function renderBizHero(d) {
  const bonuses = d.bonuses || {};
  const totals = d.totals || {};
  const accrued = parseMoney((bonuses.accrued && bonuses.accrued.amount) || '');
  const moneyLabel = currentLang === 'uz' ? "so'm" : 'сум';

  // Сумма продаж квартала из фактов месяцев
  const months = totals.months || d.months || {};
  let revenue = 0;
  ['january', 'february', 'march'].forEach(m => {
    revenue += parseMoney((months[m] && months[m].fact) || '0');
  });

  // === HERO === — история доходов за 8 месяцев работы с DATFO (демо)
  const innStr = currentPharmInn || (currentPharm && currentPharm.inn) || 'demo';
  const earnings = generateEarningsHistory(String(innStr), 8);

  // Подпись только в двух вариантах: рост / стабильно.
  // Вариант с "вернём рост" убран — это история, всегда позитив.
  let subKey = 'bizHeroEarnedSubFlat';
  if (earnings.growthPct >= 5) subKey = 'bizHeroEarnedSubGrowth';

  const heroEl = document.getElementById('bizHero');
  if (heroEl) {
    heroEl.className = 'biz-hero success';  // всегда позитив — это история
    const amountClass = earnings.total >= 10000000 ? 'medium' : '';
    heroEl.innerHTML = `
      <div class="biz-hero-label">${t('bizHeroEarnedYou')}</div>
      <div class="biz-hero-amount ${amountClass}">${formatMoney(earnings.total)} ${moneyLabel}</div>
      <div class="biz-hero-sub">${t(subKey, { n: earnings.months, pct: Math.abs(earnings.growthPct) })}</div>
      <div class="biz-hero-chart">${renderSparkline(earnings.values, { width: 240, height: 44 })}</div>
      <button class="biz-hero-could" onclick="adviceCtaClick('could-have-more', 'history')">
        <span class="biz-hero-could-icon">💡</span>
        <span class="biz-hero-could-text">${t('bizHeroCould', { amount: formatMoney(earnings.couldHave), money: moneyLabel })}</span>
      </button>
    `;
  }

  // === SECONDARY === — 2 карточки: бонус за текущий квартал + продажи квартала
  const secEl = document.getElementById('bizSecondary');
  if (secEl) {
    secEl.innerHTML = `
      <div class="biz-sec-card">
        <div class="biz-sec-label">${t('bizSecEarned')}</div>
        <div class="biz-sec-val green">${formatMoney(accrued)} ${moneyLabel}</div>
      </div>
      <div class="biz-sec-card">
        <div class="biz-sec-label">${t('bizSecRevenue')}</div>
        <div class="biz-sec-val">${formatMoney(revenue)} ${moneyLabel}</div>
      </div>
    `;
  }
}

// ============================================================
// TRIGGER ALERT BAR (топ-плашка)
// ============================================================
let currentAlertContext = null; // 'lost' | 'risk' | 'win'

function renderAlertBar(d) {
  const bar = document.getElementById('alertBar');
  const icon = document.getElementById('alertBarIcon');
  const txt = document.getElementById('alertBarText');
  if (!bar) return;

  const bonuses = d.bonuses || {};
  const potential = parseMoney((bonuses.potential && bonuses.potential.amount) || '');
  const accrued = parseMoney((bonuses.accrued && bonuses.accrued.amount) || '');
  const lost = Math.max(0, potential - accrued);

  const stats = d.stats || {};
  const critical = stats.critical || 0;
  const pct = d.totals && d.totals.quarter_percent;

  bar.className = 'alert-bar';
  if (critical > 0) {
    bar.classList.add('danger');
    bar.style.display = '';
    icon.textContent = '🔴';
    txt.innerHTML = (currentLang === 'uz'
      ? `<b>${critical}</b> ta loyihada ortda qolyapsiz — harakat kerak`
      : `<b>${critical}</b> ${critical === 1 ? 'проект' : 'проекта'} отстаёт — нужно действовать`);
    currentAlertContext = 'risk';
  } else if (lost > 0) {
    bar.classList.add('warning');
    bar.style.display = '';
    icon.textContent = '⚡';
    const moneyLabel = currentLang === 'uz' ? "so'm" : 'сум';
    txt.innerHTML = (currentLang === 'uz'
      ? `Boy berasiz: <b>${formatMoney(lost)} ${moneyLabel}</b>`
      : `Упускаете: <b>${formatMoney(lost)} ${moneyLabel}</b>`);
    currentAlertContext = 'lost';
  } else if (pct != null && Number(pct) >= 100) {
    bar.classList.add('success');
    bar.style.display = '';
    icon.textContent = '✓';
    txt.innerHTML = (currentLang === 'uz'
      ? `Reja bajarildi — <b>${pct}%</b>. Davom eting.`
      : `План выполнен — <b>${pct}%</b>. Продолжайте темп.`);
    currentAlertContext = 'win';
  } else {
    bar.style.display = 'none';
    currentAlertContext = null;
  }
}

window.alertBarClick = function() {
  trackEvent('alert_bar_click', { context: currentAlertContext });
  contactManager();
};

// ============================================================
// PROMO MODAL — большой "рекламный" попап через несколько секунд
// ============================================================
let promoScheduled = false;

function schedulePromo(d) {
  if (promoScheduled) return;
  promoScheduled = true;

  // Показываем 1 раз за сессию Mini App.
  try {
    if (sessionStorage.getItem('datfo_promo_shown')) return;
  } catch (e) {}

  // Подбираем "тему промо" — персонально для этой аптеки.
  const promo = buildPromoContent(d);
  if (!promo) return;

  // Задержка ~12 сек — даём аптеке посмотреть свои цифры, потом всплывает оффер.
  setTimeout(() => showPromo(promo), 12000);
}

function buildPromoContent(d) {
  const projects = Array.isArray(d.projects) ? d.projects : [];
  const bonuses = d.bonuses || {};
  const totals = d.totals || {};
  const potential = parseMoney((bonuses.potential && bonuses.potential.amount) || '');
  const accrued = parseMoney((bonuses.accrued && bonuses.accrued.amount) || '');
  const lost = Math.max(0, potential - accrued);
  const quarterPct = totals.quarter_percent != null ? Number(totals.quarter_percent) : null;
  const moneyLabel = currentLang === 'uz' ? "so'm" : 'сум';
  const eyebrow = currentLang === 'uz' ? 'HAFTA TAKLIFI' : 'ПРЕДЛОЖЕНИЕ НЕДЕЛИ';
  const ctaText = currentLang === 'uz' ? "Menejer bilan bog'lanish" : 'Связаться с менеджером';

  // Сценарий А: есть конкретный "плохой" проект с ненулевым бонусом — самый сильный триггер.
  const weak = projects
    .filter(p => p.percent < 100 && parseMoney(p.bonus_amount || '0') > 0)
    .sort((a, b) => a.percent - b.percent);

  if (weak.length > 0) {
    const worst = weak[0];
    const bonusVal = parseMoney(worst.bonus_amount || '0');
    const factVal = parseMoney(worst.fact || '0');
    const planVal = parseMoney(worst.quarter_plan || '0');
    const gap = Math.max(0, planVal - factVal);
    return {
      icon: '🔥',
      eyebrow,
      amount: formatMoney(bonusVal) + ' ' + moneyLabel,
      text: currentLang === 'uz'
        ? `<b>${escapeHtml(worst.name)}</b> loyihasi <b>${worst.percent}%</b>ga bajarilgan. Yana <b>${formatMoney(gap)} ${moneyLabel}</b>lik buyurtma — to'liq bonus sizniki.`
        : `Проект <b>${escapeHtml(worst.name)}</b> выполнен на <b>${worst.percent}%</b>. Закажите ещё на <b>${formatMoney(gap)} ${moneyLabel}</b> — полный бонус ваш.`,
      ctaText,
    };
  }

  // Сценарий Б: суммарная упущенная выгода без конкретного "плохого" проекта.
  if (lost > 0) {
    return {
      icon: '💰',
      eyebrow,
      amount: formatMoney(lost) + ' ' + moneyLabel,
      text: currentLang === 'uz'
        ? `Chorak oxirigacha bu summani <b>olishingiz mumkin</b>. Menejer ustuvor loyihalarni tanlab beradi.`
        : `До конца квартала эту сумму <b>ещё можно забрать</b>. Менеджер подскажет приоритетные проекты.`,
      ctaText,
    };
  }

  // Сценарий В: квартал закрыт (≥ 100%). Двигаем дальше — на перевыполнение.
  if (quarterPct != null && quarterPct >= 100) {
    // Топ-проект, который можно ещё раскачать (любой completed — есть куда расти)
    const topProject = projects
      .filter(p => parseMoney(p.bonus_amount || '0') > 0)
      .sort((a, b) => parseMoney(b.bonus_amount || '0') - parseMoney(a.bonus_amount || '0'))[0];
    const projectName = topProject ? escapeHtml(topProject.name) : (currentLang === 'uz' ? 'TOP loyiha' : 'топ-проектом');
    return {
      icon: '🚀',
      eyebrow,
      amount: quarterPct + '%',
      text: currentLang === 'uz'
        ? `Reja <b>${quarterPct}%</b>ga bajarilgan. <b>${projectName}</b> bo'yicha ortiqcha bajaring — qo'shimcha bonus oling.`
        : `План закрыт на <b>${quarterPct}%</b>. Перевыполните по <b>${projectName}</b> — получите дополнительный бонус.`,
      ctaText,
    };
  }

  // Сценарий Г: дефолтный — у аптеки нет проектов с бонусом, но мы всё равно показываем оффер.
  return {
    icon: '⭐',
    eyebrow,
    amount: currentLang === 'uz' ? 'Yangi loyihalar' : 'Новые проекты',
    text: currentLang === 'uz'
      ? `Sizning kategoriyangizdagi dorixonalar uchun yangi imkoniyatlar bor. Menejer sizga mos taklifni aytadi.`
      : `Для аптек вашей категории есть новые проекты. Менеджер расскажет, что вам подойдёт.`,
    ctaText,
  };
}

let promoScenario = null;  // запоминаем сценарий, чтобы отправить с CTA/skip

function showPromo(promo) {
  // Доп. защита: не показываем CTA-промо админам, даже если таймер успел
  // стартовать до того как роль была понятна.
  if (window.userData && window.userData.is_admin) return;
  // И не отвлекаем юзера во время обучающего тура.
  if (document.body.classList.contains('tour-active')) return;
  const overlay = document.getElementById('promoOverlay');
  if (!overlay) return;
  setTimeout(updateBackButton, 0);
  document.getElementById('promoIcon').textContent = promo.icon;
  document.getElementById('promoEyebrow').textContent = promo.eyebrow;
  document.getElementById('promoAmount').textContent = promo.amount;
  document.getElementById('promoText').innerHTML = promo.text;
  document.getElementById('promoCta').textContent = promo.ctaText;
  overlay.classList.add('active');
  promoScenario = promo.icon;  // используем иконку как код сценария (🔥/💰/🚀/⭐)
  trackEvent('promo_shown', { scenario: promoScenario });
  try { sessionStorage.setItem('datfo_promo_shown', '1'); } catch (e) {}
}

window.closePromo = function() {
  const overlay = document.getElementById('promoOverlay');
  if (overlay && overlay.classList.contains('active')) {
    trackEvent('promo_skip', { scenario: promoScenario });
  }
  if (overlay) overlay.classList.remove('active');
  updateBackButton();
};

window.promoCtaClick = function() {
  trackEvent('promo_cta', { scenario: promoScenario });
  const overlay = document.getElementById('promoOverlay');
  if (overlay) overlay.classList.remove('active');
  contactManager();
};

function renderLostOpportunity(d) {
  const bonuses = d.bonuses || {};
  const potential = parseMoney((bonuses.potential && bonuses.potential.amount) || '');
  const accrued = parseMoney((bonuses.accrued && bonuses.accrued.amount) || '');
  const lost = Math.max(0, potential - accrued);

  const hero = document.getElementById('heroLost');
  if (lost <= 0) { hero.style.display = 'none'; return; }
  hero.style.display = 'block';
  setText('#lostAmount', formatMoney(lost) + ' ' + (currentLang === 'uz' ? "so'm" : 'сум'));
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
  trackEvent('contact_manager', {});
  // Берём данные той аптеки, чей дашборд сейчас открыт.
  // Раньше читали userData.pharmacies[0] — это всегда первая аптека из списка,
  // из-за чего у админа во всех аптеках показывался один и тот же менеджер.
  let d = (currentPharm && currentPharm.dashboard) || {};
  if (!d.manager && window.userData && window.userData.pharmacies && window.userData.pharmacies[0]) {
    // Фолбэк для обычной аптеки: если currentPharm ещё не выставлен (рендер не успел) —
    // берём первую (и единственную) аптеку пользователя.
    d = window.userData.pharmacies[0].dashboard || {};
  }
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
  updateBackButton();
};

window.closeManager = function(e) {
  if (e && e.target && e.target.id !== 'mgrOverlay' && !e.target.classList.contains('mgr-close')) return;
  document.getElementById('mgrOverlay').classList.remove('active');
  updateBackButton();
};

window.openExternal = function(url, e) {
  if (e) e.preventDefault();
  trackEvent('phone_click', {});
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.openLink) tg.openLink(url);
  else window.location.href = url;
};

window.openTg = function(username, e) {
  if (e) e.preventDefault();
  trackEvent('tg_click', { username });
  const link = 'https://t.me/' + username;
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.openTelegramLink) tg.openTelegramLink(link);
  else if (tg && tg.openLink) tg.openLink(link);
  else window.open(link, '_blank');
};


// ============================================================
// FAQ — частые вопросы (быстрые ответы)
// ============================================================
const FAQ_DATA = {
  ru: [
    { cat: 'Метрики',  q: 'Что значит «Можно забрать»?',           a: 'Это сумма бонуса, которую вы можете дополнительно получить до конца квартала, если закроете план по проектам. Каждый незакрытый проект уменьшает эту сумму.' },
    { cat: 'Метрики',  q: 'Что значит «Заработали»?',              a: 'Бонус, уже накопленный за этот квартал — то, что DATFO выплатит вам по итогам. Считается по факту выполнения каждого проекта.' },
    { cat: 'Метрики',  q: 'Что показывает «Выручка Q1»?',          a: 'Общая сумма ваших продаж по проектам DATFO за квартал — то, сколько вы пробили в кассу по этим товарам.' },
    { cat: 'Метрики',  q: 'Что значит % квартала?',                a: 'Процент выполнения квартального плана по всем вашим проектам вместе. <b>100% и выше</b> = план закрыт, полный бонус ваш.' },
    { cat: 'Бонусы',   q: 'Как считается мой бонус?',              a: 'По каждому проекту: <b>квартальный план × % бонуса проекта × ваш % выполнения</b>. Полный бонус — при выполнении 100%. KRKA = 7%, KUSUM = 3%, BAYER = 7% и т.д.' },
    { cat: 'Бонусы',   q: 'Когда мне выплачивают бонус?',          a: 'По итогам каждого квартала после закрытия отчётности. Уточните точные сроки у вашего менеджера.' },
    { cat: 'Бонусы',   q: 'Можно ли получить бонус за перевыполнение?', a: 'Да — при выполнении плана выше 100% начисляется дополнительный бонус. Условия уточните у менеджера.' },
    { cat: 'Продукты', q: 'Что значит «Нет в портфеле»?',          a: 'Вы не закупаете этот товар. Соседние аптеки уже на нём зарабатывают — начните продавать и получите долю рынка + бонус.' },
    { cat: 'Продукты', q: 'Где увидеть товары проекта?',           a: 'Нажмите на любой проект в списке «Активные проекты». Откроется список с ценами, маржей, прибылью с упаковки и потенциалом по каждому товару.' },
    { cat: 'Продукты', q: 'Как заказать товар?',                   a: 'Нажмите «Добавить в портфель» в карточке товара или «Связаться с менеджером» — менеджер оформит заявку.' },
    { cat: 'Продукты', q: 'Что значит «топ-3 района»?',            a: 'Вы входите в тройку лидеров среди аптек района по продажам этого товара. Так держать.' },
    { cat: 'Менеджер', q: 'Как связаться с менеджером?',           a: 'Нажмите кнопку «Связаться с менеджером» в любом разделе — откроется чат с вашим персональным менеджером в Telegram.' },
    { cat: 'Менеджер', q: 'Что делать если данные неправильные?',   a: 'Свяжитесь с менеджером — он проверит источник и поправит данные в системе. Обновление займёт до 5 минут.' },
    { cat: 'Сервис',   q: 'Когда обновляются данные?',             a: 'Автоматически каждые 5 минут. Менеджеры обновляют исходную таблицу — система сама подтягивает свежие цифры.' },
    { cat: 'Сервис',   q: 'Можно ли изменить язык?',               a: 'Да — кнопки <b>RU / UZ</b> в правом верхнем углу. Язык запоминается.' },
    { cat: 'Сервис',   q: 'Кому пожаловаться?',                    a: 'Прямой контакт с менеджером — кнопка «Связаться с менеджером». Если жалоба на менеджера — пишите администратору DATFO.' },
  ],
  uz: [
    { cat: 'Metrikalar', q: '«Olish mumkin» nima degani?',           a: "Bu — chorak oxirigacha loyihalar rejasini yopsangiz qo'shimcha olishingiz mumkin bo'lgan bonus." },
    { cat: 'Metrikalar', q: '«Topildi» nima?',                       a: "Bu chorakda allaqachon to'plangan bonus — DATFO chorak oxirida to'laydigan summa." },
    { cat: 'Metrikalar', q: "«Chorak sotuvi» nimani ko'rsatadi?",   a: "DATFO loyihalari bo'yicha chorak ichida sotgan umumiy summangiz — kassadan o'tgan pul." },
    { cat: 'Metrikalar', q: 'Chorak %i nima?',                       a: "Hamma loyihalar bo'yicha chorak rejasining bajarilish foizi. <b>100% va undan yuqori</b> — reja yopildi, bonus sizniki." },
    { cat: 'Bonuslar',   q: 'Bonus qanday hisoblanadi?',             a: "Har loyihada: <b>chorak rejasi × loyiha bonusi % × bajarilish %</b>. To'liq bonus — 100% bajarganda. KRKA = 7%, KUSUM = 3%, BAYER = 7% va h.k." },
    { cat: 'Bonuslar',   q: "Bonus qachon to'lanadi?",               a: "Har chorak yakunida, hisobot yopilgandan keyin. Aniq muddatlarni menejerdan so'rang." },
    { cat: 'Bonuslar',   q: 'Ortiqcha bajarganda bonus bormi?',      a: "Ha — 100%dan ortiqcha bajarganda qo'shimcha bonus beriladi. Shartlarni menejerdan so'rang." },
    { cat: 'Mahsulotlar', q: "«Portfelda yo'q» nima?",                a: "Bu mahsulotni xarid qilmayapsiz. Qo'shni dorixonalar undan daromad olyapti — boshlang, bozor ulushini oling + bonus." },
    { cat: 'Mahsulotlar', q: "Loyiha mahsulotlarini qayerda ko'raman?", a: "«Faol loyihalar»dan istalganini bosing. Narxlari, marja, donadan foyda va potensial bilan ro'yxat ochiladi." },
    { cat: 'Mahsulotlar', q: 'Mahsulot qanday buyurtma qilinadi?',   a: "Mahsulot kartochkasidagi «Portfelga qo'shish» yoki «Menejer bilan gaplashish» tugmasini bosing — menejer arizani tuzadi." },
    { cat: 'Mahsulotlar', q: '«Top-3 tuman» nima degani?',           a: 'Bu mahsulot bo\'yicha tumandagi dorixonalar orasida sotuvlar bo\'yicha eng yaxshi uchligidasiz. Zo\'r ish.' },
    { cat: 'Menejer',    q: "Menejer bilan qanday bog'lanaman?",     a: "Istalgan bo'limda «Menejer bilan gaplashish» tugmasini bosing — shaxsiy menejeringiz bilan Telegram chati ochiladi." },
    { cat: 'Menejer',    q: "Ma'lumotlar noto'g'ri bo'lsa?",         a: "Menejerga yozing — u manbani tekshirib tuzatadi. Yangilanish 5 daqiqagacha vaqt oladi." },
    { cat: 'Servis',     q: "Ma'lumotlar qachon yangilanadi?",       a: "Har 5 daqiqada avtomatik. Menejerlar manba jadvalini yangilashi bilan tizim yangi raqamlarni oladi." },
    { cat: 'Servis',     q: "Tilni o'zgartirsa bo'ladimi?",          a: "Ha — yuqori o'ng burchakdagi <b>RU / UZ</b> tugmalari. Til eslab qolinadi." },
    { cat: 'Servis',     q: "Shikoyat qayerga yoziladi?",            a: "Menejer bilan to'g'ridan-to'g'ri — «Menejer bilan gaplashish» orqali. Agar menejer haqida shikoyat bo'lsa — DATFO administratoriga yozing." },
  ],
};

let faqSearchQuery = '';

let faqMode = 'quick'; // 'quick' | 'ai'
let aiConversation = []; // история сообщений за сессию
let faqAutoHideTimer = null;

function setupFaqAutoHide() {
  const fab = document.getElementById('faqFab');
  if (!fab) return;
  // Через 20 сек после открытия аппа — мягко скрываем кнопку.
  faqAutoHideTimer = setTimeout(() => fab.classList.add('faded'), 20000);

  // Если юзер скроллит вверх (ближе к шапке) — показываем снова.
  window.addEventListener('scroll', () => {
    if (!fab) return;
    if (window.scrollY < 80) {
      fab.classList.remove('faded');
    }
  }, { passive: true });

  // Прячем FAQ когда "Связаться с менеджером" виден на экране — иначе кнопки
  // перекрывают друг друга в правом нижнем углу.
  if ('IntersectionObserver' in window) {
    const observed = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          fab.classList.add('faded');
        }
      });
    }, { threshold: 0.15 });

    // CTA-блок (cta-manager) и любые большие primary-кнопки в нижней зоне
    const watch = () => {
      document.querySelectorAll('.cta-manager, .cta-manager-btn').forEach((el) => {
        if (!observed.has(el)) { observer.observe(el); observed.add(el); }
      });
    };
    watch();
    // На случай если CTA-секция перерендерилась — повторим через короткий тик.
    setTimeout(watch, 1000);
  }
}

window.openFaq = function() {
  // Любой клик по кнопке отменяет автоскрытие и снимает класс
  const fab = document.getElementById('faqFab');
  if (fab) fab.classList.remove('faded');
  if (faqAutoHideTimer) { clearTimeout(faqAutoHideTimer); faqAutoHideTimer = null; }

  trackEvent('faq_open', {});
  faqSearchQuery = '';
  const searchEl = document.getElementById('faqSearch');
  if (searchEl) {
    searchEl.value = '';
    searchEl.oninput = (e) => {
      faqSearchQuery = e.target.value.toLowerCase().trim();
      renderFaqList();
    };
  }
  renderFaqList();
  renderAiSuggestions();
  const overlay = document.getElementById('faqOverlay');
  if (overlay) overlay.classList.add('active');
  updateBackButton();
};

window.setFaqMode = function(mode) {
  if (mode !== 'quick' && mode !== 'ai') return;
  faqMode = mode;
  document.querySelectorAll('.faq-mode-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-mode') === mode);
  });
  const quickV = document.getElementById('faqModeQuickView');
  const aiV    = document.getElementById('faqModeAiView');
  if (mode === 'ai') {
    quickV.style.display = 'none';
    aiV.style.display    = '';
    setTimeout(() => { const i = document.getElementById('aiInput'); if (i) i.focus(); }, 100);
  } else {
    quickV.style.display = '';
    aiV.style.display    = 'none';
  }
};

function renderAiSuggestions() {
  const root = document.getElementById('aiSuggestions');
  if (!root) return;
  // Подсказки показываем только пока чат пустой (нет переписки)
  if (aiConversation.length > 0) { root.innerHTML = ''; return; }
  const sugg = t('aiSuggestions');
  if (!Array.isArray(sugg)) { root.innerHTML = ''; return; }
  root.innerHTML = sugg.map(s => `
    <button class="ai-suggestion" onclick="askAiSuggestion('${escapeHtml(s).replace(/'/g, "\\'")}')">${escapeHtml(s)}</button>
  `).join('');
}

window.askAiSuggestion = function(text) {
  const input = document.getElementById('aiInput');
  if (input) input.value = text;
  sendAiQuestion();
};

window.sendAiQuestion = async function() {
  const input = document.getElementById('aiInput');
  if (!input) return;
  const q = input.value.trim();
  if (!q) return;
  input.value = '';

  // Если первый вопрос — убираем welcome-блок и подсказки
  const chat = document.getElementById('aiChat');
  if (aiConversation.length === 0) {
    chat.innerHTML = '';
    document.getElementById('aiSuggestions').innerHTML = '';
  }

  // Рендерим вопрос пользователя
  aiConversation.push({ role: 'user', text: q });
  appendAiMessage('user', q);

  // Лоадер "печатает..."
  const typingId = 'ai-typing-' + Date.now();
  chat.insertAdjacentHTML('beforeend', `
    <div class="ai-msg typing" id="${typingId}">
      <span class="ai-typing-dots"><span></span><span></span><span></span></span>
    </div>
  `);
  scrollAiChat();

  // Запрос к API
  const sendBtn = document.getElementById('aiSendBtn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
    const urlParams = new URLSearchParams(window.location.search);
    const tgIdFromUrl = urlParams.get('tg_id');
    const url = new URL(API_BASE + '/api/ai/ask');
    if (initData) url.searchParams.set('init_data', initData);
    else if (tgIdFromUrl) url.searchParams.set('tg_id', tgIdFromUrl);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...(initData ? { 'X-Telegram-Init-Data': initData } : {}),
      },
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json();

    const typing = document.getElementById(typingId);
    if (typing) typing.remove();

    if (!res.ok) {
      const msg = data.error === 'ai_disabled' ? t('aiErrorDisabled') : (data.message || t('aiErrorGeneric'));
      appendAiMessage('error', msg);
    } else if (data.answer) {
      aiConversation.push({ role: 'assistant', text: data.answer });
      appendAiMessage('assistant', data.answer);
    } else {
      appendAiMessage('error', t('aiErrorGeneric'));
    }
  } catch (e) {
    const typing = document.getElementById(typingId);
    if (typing) typing.remove();
    appendAiMessage('error', t('aiErrorGeneric'));
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    scrollAiChat();
  }
};

function appendAiMessage(role, text) {
  const chat = document.getElementById('aiChat');
  if (!chat) return;
  const div = document.createElement('div');
  div.className = 'ai-msg ' + role;
  // assistant: безопасный markdown-light — **bold** и переносы строк
  if (role === 'assistant') {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    html = html.replace(/\n/g, '<br>');
    div.innerHTML = html;
  } else {
    div.textContent = text;
  }
  chat.appendChild(div);
  scrollAiChat();
}

function scrollAiChat() {
  const sheet = document.querySelector('.faq-sheet');
  if (sheet) sheet.scrollTop = sheet.scrollHeight;
}

window.closeFaq = function() {
  const overlay = document.getElementById('faqOverlay');
  if (overlay) overlay.classList.remove('active');
  updateBackButton();
};

window.toggleFaqItem = function(idx) {
  const item = document.getElementById('faq-item-' + idx);
  if (!item) return;
  const wasOpen = item.classList.contains('open');
  // закрываем все, открываем выбранный (accordion behavior)
  document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('open'));
  if (!wasOpen) {
    item.classList.add('open');
    trackEvent('faq_question_open', { idx });
  }
};

window.faqStartTour = function() {
  trackEvent('faq_tour_start', {});
  window.closeFaq();
  window.tourShowWelcome();
};

function renderFaqList() {
  const root = document.getElementById('faqList');
  if (!root) return;
  const items = FAQ_DATA[currentLang] || FAQ_DATA.ru;
  const q = faqSearchQuery;
  const filtered = q
    ? items.filter(it => (it.q + ' ' + it.a + ' ' + it.cat).toLowerCase().includes(q))
    : items;

  if (!filtered.length) {
    root.innerHTML = `<div class="faq-empty">${t('faqEmpty')}</div>`;
    return;
  }

  root.innerHTML = filtered.map((it, idx) => `
    <div class="faq-item" id="faq-item-${idx}">
      <button class="faq-q" onclick="toggleFaqItem(${idx})">
        <span><span class="faq-cat">${escapeHtml(it.cat)}</span>${escapeHtml(it.q)}</span>
      </button>
      <div class="faq-a">${it.a}</div>
    </div>
  `).join('');
}

// ============================================================
// FAKE PRODUCTS (для демо) — реалистичный набор по проектам.
// Когда придёт реальная "Продукция" таблица — заменим этот объект на /api/projects/{name}/products.
// ============================================================
// Маркетплейс-формат: брэнд (буква + цвет в аватарке), закупочная цена,
// розница, маржа считается автоматически.
const FAKE_PRODUCTS = {
  'КРКА': [
    { id: 'krka-enal',  name: 'Эналаприл',        dosage: '10 мг',  form: 'таб. №20',  price: 12500, retail: 18000, monthly_orders_avg: 20, bonus_pct: 7 },
    { id: 'krka-noli',  name: 'Нолипрел Би-форте', dosage: '5+1.25 мг', form: 'таб. №30', price: 95000, retail: 145000, monthly_orders_avg: 12, bonus_pct: 7 },
    { id: 'krka-zofe',  name: 'Зофеноприл',       dosage: '30 мг',  form: 'таб. №28',  price: 78000, retail: 115000, monthly_orders_avg: 8,  bonus_pct: 7 },
    { id: 'krka-loza',  name: 'Лозартан',         dosage: '50 мг',  form: 'таб. №30',  price: 38000, retail: 56000, monthly_orders_avg: 15, bonus_pct: 7 },
    { id: 'krka-sept',  name: 'Septolete',        dosage: '1.2 мг', form: 'паст. №18', price: 22000, retail: 33000, monthly_orders_avg: 35, bonus_pct: 7 },
  ],
  'KUSUM': [
    { id: 'kus-levo',   name: 'Левомеколь',       dosage: '40 г',     form: 'мазь',       price: 8200,  retail: 12000, monthly_orders_avg: 30, bonus_pct: 3 },
    { id: 'kus-deks',   name: 'Декспантенол',     dosage: '5%',       form: 'крем 30г',   price: 14500, retail: 22000, monthly_orders_avg: 22, bonus_pct: 3 },
    { id: 'kus-amox',   name: 'Амоксициллин',     dosage: '500 мг',   form: 'капс. №20',  price: 18000, retail: 27000, monthly_orders_avg: 18, bonus_pct: 3 },
    { id: 'kus-vita',   name: 'Витамин Д3',       dosage: '2000 МЕ',  form: 'капли 10мл', price: 32000, retail: 48000, monthly_orders_avg: 25, bonus_pct: 3 },
  ],
  'WELFARM': [
    { id: 'wel-para',   name: 'Парацетамол',      dosage: '500 мг',   form: 'таб. №20',   price: 4500,  retail: 7500,  monthly_orders_avg: 50, bonus_pct: 7 },
    { id: 'wel-ibup',   name: 'Ибупрофен',        dosage: '400 мг',   form: 'таб. №20',   price: 7800,  retail: 12500, monthly_orders_avg: 40, bonus_pct: 7 },
    { id: 'wel-mult',   name: 'Мультивитамин',    dosage: 'комплекс', form: 'таб. №60',   price: 48000, retail: 72000, monthly_orders_avg: 18, bonus_pct: 7 },
    { id: 'wel-omeg',   name: 'Омега-3',          dosage: '1000 мг',  form: 'капс. №60',  price: 65000, retail: 98000, monthly_orders_avg: 14, bonus_pct: 7 },
  ],
  'GETZ PHARMA': [
    { id: 'getz-azit',  name: 'Азитромицин',      dosage: '500 мг',   form: 'таб. №3',    price: 28000, retail: 42000, monthly_orders_avg: 24, bonus_pct: 7 },
    { id: 'getz-clar',  name: 'Кларитромицин',    dosage: '500 мг',   form: 'таб. №14',   price: 56000, retail: 85000, monthly_orders_avg: 12, bonus_pct: 7 },
    { id: 'getz-mela',  name: 'Мелатонин',        dosage: '3 мг',     form: 'таб. №30',   price: 42000, retail: 65000, monthly_orders_avg: 20, bonus_pct: 7 },
  ],
  'BAYER': [
    { id: 'bay-asp',    name: 'Аспирин Кардио',   dosage: '100 мг',   form: 'таб. №30',   price: 35000, retail: 52000, monthly_orders_avg: 28, bonus_pct: 7 },
    { id: 'bay-can',    name: 'Канестен',         dosage: '1%',       form: 'крем 20г',   price: 48000, retail: 72000, monthly_orders_avg: 16, bonus_pct: 7 },
    { id: 'bay-cipro',  name: 'Ципрофлоксацин',   dosage: '500 мг',   form: 'таб. №10',   price: 22000, retail: 33000, monthly_orders_avg: 22, bonus_pct: 7 },
  ],
  'FERON': [
    { id: 'fer-ifn',    name: 'Интерферон',       dosage: '500000 МЕ', form: 'свечи №10',  price: 95000, retail: 142000, monthly_orders_avg: 15, bonus_pct: 7 },
    { id: 'fer-anaf',   name: 'Анаферон',         dosage: 'детский',   form: 'таб. №20',   price: 28000, retail: 42000, monthly_orders_avg: 32, bonus_pct: 7 },
  ],
  'SAFE': [
    { id: 'safe-glov',  name: 'Перчатки нитриловые', dosage: 'размер M', form: 'уп. 100', price: 75000, retail: 112000, monthly_orders_avg: 18, bonus_pct: 7 },
    { id: 'safe-mask',  name: 'Маска медицинская',    dosage: '3-сл.',   form: 'уп. 50',  price: 22000, retail: 33000,  monthly_orders_avg: 25, bonus_pct: 7 },
  ],
};

const DEFAULT_FAKE_PRODUCTS = [
  { id: 'gen-1', name: 'Препарат A', dosage: '—', form: 'упак.', price: 25000, retail: 38000, monthly_orders_avg: 20, bonus_pct: 7 },
  { id: 'gen-2', name: 'Препарат B', dosage: '—', form: 'упак.', price: 18000, retail: 27000, monthly_orders_avg: 28, bonus_pct: 7 },
  { id: 'gen-3', name: 'Препарат C', dosage: '—', form: 'упак.', price: 42000, retail: 63000, monthly_orders_avg: 14, bonus_pct: 7 },
];

// Цвета аватарок брендов (для маркетплейс-стиля). Если бренда нет в карте — slate.
const BRAND_COLORS = {
  'КРКА':        '#16a34a', // зелёный — KRKA Slovenia
  'KUSUM':       '#dc2626',
  'WELFARM':     '#0891b2',
  'GETZ PHARMA': '#7c3aed',
  'BAYER':       '#1e40af',
  'FERON':       '#ea580c',
  'SAFE':        '#475569',
  'SIRIUS':      '#c026d3',
  'SENTISS':     '#0d9488',
  'BIOMIND':     '#65a30d',
  'ZOMMER':      '#b45309',
  'ASFARMA':     '#0369a1',
};

function brandColor(name) {
  return BRAND_COLORS[(name || '').toUpperCase()] || '#0f172a';
}

// Карта "наш товар → конкурент на рынке" для генерации советов.
// Когда придёт лист "Конкуренты" — заменим на реальные данные.
const COMPETITOR_MAP = {
  'Septolete':         { competitor: 'Strepsils',         brand: 'Reckitt',         reason: 'Тот же спектр действия, ниже бонус.' },
  'Эналаприл':         { competitor: 'Энам',              brand: "Dr. Reddy's",     reason: 'Аналог, но менее стабильные поставки.' },
  'Нолипрел Би-форте': { competitor: 'Лористу',           brand: 'Berlin-Chemie',   reason: 'Дороже для аптеки, маржа ниже.' },
  'Лозартан':          { competitor: 'Козаар',            brand: 'MSD',             reason: 'Импортный, маржа меньше.' },
  'Зофеноприл':        { competitor: 'Зокардис',          brand: 'Berlin-Chemie',   reason: 'Близкий аналог, дороже для розницы.' },
  'Парацетамол':       { competitor: 'Калпол',            brand: 'GSK',             reason: 'Импортный — выше цена, ниже маржа.' },
  'Ибупрофен':         { competitor: 'Нурофен',           brand: 'Reckitt',         reason: 'Бренд дороже, но маржа у нас выше.' },
  'Левомеколь':        { competitor: 'Бактробан',         brand: 'GSK',             reason: 'Уже спектр, дороже.' },
  'Декспантенол':      { competitor: 'Бепантен',          brand: 'Bayer',           reason: 'То же активное в-во, ваша маржа выше у нас.' },
  'Витамин Д3':        { competitor: 'Аквадетрим',        brand: 'Polpharma',       reason: 'Аналог с меньшим бонусом.' },
  'Омега-3':           { competitor: 'Доппельгерц Омега', brand: 'Queisser',        reason: 'Дороже, маржа ниже.' },
  'Канестен':          { competitor: 'Клотримазол ген.',  brand: 'дженерики',       reason: 'Дженерик с минимальной маржой.' },
  'Аспирин Кардио':    { competitor: 'Кардиомагнил',      brand: 'Takeda',          reason: 'Аналог, бонус у DATFO выше.' },
  'Азитромицин':       { competitor: 'Сумамед',           brand: 'Pliva',           reason: 'Бренд дороже, маржа меньше.' },
  'Мелатонин':         { competitor: 'Меларена',          brand: 'РЗС',             reason: 'Дороже на полке.' },
};

function brandLetter(name) {
  const n = (name || '?').trim();
  // Если есть пробел/дефис — берём первые буквы 2 слов
  const parts = n.split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.substring(0, 2).toUpperCase();
}

function getFakeProducts(projectName) {
  const upper = (projectName || '').toUpperCase().trim();
  return FAKE_PRODUCTS[upper] || DEFAULT_FAKE_PRODUCTS;
}

// Простой стабильный хеш — чтобы у одной аптеки всегда был один и тот же набор статусов
function simpleHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return Math.abs(h) >>> 0;
}

// Для каждого (аптека × товар) детерминированно вычисляем "статус закупки"
function getProductStatus(pharmacyInn, productId) {
  const h = simpleHash((pharmacyInn || 'demo') + ':' + productId);
  const bucket = h % 100;
  if (bucket < 30) return 'active';     // активно покупает
  if (bucket < 50) return 'occasional'; // пробовал
  return 'missed';                       // не покупает — целевая группа для допродаж
}

// Прогноз месячного объёма с небольшим разбросом, тоже стабильный
function getMonthlyOrders(pharmacyInn, productId, avg) {
  const h = simpleHash((pharmacyInn || 'demo') + ':' + productId + ':qty');
  const factor = 0.6 + (h % 80) / 100;  // от 0.6 до 1.4 от среднего
  return Math.round(avg * factor);
}

// Сценарий "сколько потенциально может заработать аптека, если включится в проект по этому товару"
function getQuarterlyPotential(product, monthlyOrders) {
  // Бонус = (закупочная цена × кол-во в месяц × 3 месяца) × bonus_pct%
  return Math.round(product.price * monthlyOrders * 3 * product.bonus_pct / 100);
}

// Конкурентная справка — стабильный фейк-снимок соседних аптек по этому товару.
// Используется чтобы давить на аптеку: "соседи покупают, а вы упускаете".
function getPeerInfo(pharmacyInn, productId, status, monthlyOrders) {
  const h = simpleHash((pharmacyInn || 'demo') + ':' + productId + ':peer');
  if (status === 'missed') {
    const total = 8 + (h % 8);                 // 8–15 соседей в регионе
    const buying = Math.max(3, Math.floor(total * 0.6) + (h % 3)); // 60–80% берут
    return { type: 'missed', total, buying };
  }
  if (status === 'occasional') {
    const myMonthly = Math.max(1, monthlyOrders);
    const topMonthly = myMonthly * (2 + (h % 3)); // лидеры в 2-4 раза больше
    return { type: 'occasional', my: myMonthly, top: topMonthly };
  }
  // active
  const rank = 1 + (h % 5);    // топ-1..5
  const region = 8 + (h % 12); // среди 8-20 аптек региона
  return { type: 'active', rank, region };
}

// ============================================================
// СОВЕТЫ ОТ FOM — рекомендации по росту продаж
// ============================================================
function generateAdvice(d, innStr) {
  if (!d || !Array.isArray(d.projects) || d.projects.length === 0) return [];

  const inn = String(innStr || 'demo');
  const advice = [];
  const used = new Set();  // чтобы не повторяться

  // === Сценарий 1: "Замените конкурента" ===
  // Сортируем проекты по слабости (худшие первыми)
  const sortedProjects = [...d.projects].sort((a, b) => (a.percent || 0) - (b.percent || 0));

  for (const project of sortedProjects) {
    const products = getFakeProducts(project.name);
    for (const product of products) {
      const status = getProductStatus(inn, product.id);
      if (status !== 'missed') continue;

      const comp = COMPETITOR_MAP[product.name];
      if (!comp) continue;
      if (used.has(product.id)) continue;

      const monthlyOrders = getMonthlyOrders(inn, product.id, product.monthly_orders_avg);
      const potential = getQuarterlyPotential(product, monthlyOrders);
      if (potential < 100000) continue;  // мелочёвку не пушим

      const margin = Math.round((product.retail - product.price) / product.price * 100);
      advice.push({
        type: 'competitor',
        icon: '💡',
        product: product.name,
        project: project.name,
        potential,
        title: t('adviceCompetitorTitle', { comp: comp.competitor, prod: product.name }),
        reason: t('adviceCompetitorReason', {
          comp: comp.competitor,
          prod: product.name,
          brand: comp.brand,
          project: project.name,
          reason: comp.reason,
        }),
        benefits: [
          { icon: '💰', text: t('adviceBenefit1', { amount: formatMoney(potential), money: (currentLang === 'uz' ? "so'm" : 'сум') }) },
          { icon: '📈', text: t('adviceBenefitMargin', { n: margin }) },
          { icon: '🎁', text: t('adviceBenefitBonus', { n: product.bonus_pct }) },
        ],
      });
      used.add(product.id);
      if (advice.length >= 1) break;  // максимум 1 совет "конкурент"
    }
    if (advice.length >= 1) break;
  }

  // === Сценарий 2: "Закройте план проекта" ===
  // Берём один из слабых проектов с топовым товаром
  for (const project of sortedProjects) {
    if (project.percent >= 100) continue;
    const products = getFakeProducts(project.name);
    // Топ-товар: с наибольшим bonus_amount_raw или просто первый в списке
    const candidate = products.find(p => !used.has(p.id));
    if (!candidate) continue;

    const monthlyOrders = getMonthlyOrders(inn, candidate.id, candidate.monthly_orders_avg);
    const factVal = parseMoney(project.fact || '0');
    const planVal = parseMoney(project.quarter_plan || project.plan || '0');
    const gap = Math.max(0, planVal - factVal);
    const unitsNeeded = candidate.price > 0 ? Math.ceil(gap / candidate.price) : 0;
    if (unitsNeeded < 5) continue;  // если меньше 5 упак — это не "закрыть план"

    const potential = getQuarterlyPotential(candidate, monthlyOrders);
    advice.push({
      type: 'plan',
      icon: '🎯',
      product: candidate.name,
      project: project.name,
      potential,
      title: t('advicePlanTitle', { project: project.name }),
      reason: t('advicePlanReason', {
        project: project.name,
        pct: project.percent,
        n: unitsNeeded,
        prod: candidate.name,
      }),
      benefits: [
        { icon: '✓', text: t('adviceBenefitPlan') },
        { icon: '💰', text: t('adviceBenefit1', { amount: formatMoney(potential), money: (currentLang === 'uz' ? "so'm" : 'сум') }) },
        { icon: '🎁', text: t('adviceBenefitBonus', { n: candidate.bonus_pct }) },
      ],
    });
    used.add(candidate.id);
    if (advice.length >= 2) break;
  }

  // === Сценарий 3: "Высокая маржа" ===
  // Из всех проектов найти товар с максимальной маржой, который ещё не в use
  let bestMargin = null;
  for (const project of d.projects) {
    const products = getFakeProducts(project.name);
    for (const product of products) {
      if (used.has(product.id)) continue;
      const status = getProductStatus(inn, product.id);
      if (status === 'active') continue;  // уже берут активно — нет смысла советовать
      const margin = Math.round((product.retail - product.price) / product.price * 100);
      if (margin < 40) continue;
      if (!bestMargin || margin > bestMargin.margin) {
        bestMargin = { product, project, margin };
      }
    }
  }
  if (bestMargin && advice.length < 3) {
    const monthlyOrders = getMonthlyOrders(inn, bestMargin.product.id, bestMargin.product.monthly_orders_avg);
    const potential = getQuarterlyPotential(bestMargin.product, monthlyOrders);
    advice.push({
      type: 'margin',
      icon: '📈',
      product: bestMargin.product.name,
      project: bestMargin.project.name,
      potential,
      title: t('adviceMarginTitle', { prod: bestMargin.product.name }),
      reason: t('adviceMarginReason', {
        prod: bestMargin.product.name,
        project: bestMargin.project.name,
        margin: bestMargin.margin,
      }),
      benefits: [
        { icon: '📈', text: t('adviceBenefitMargin', { n: bestMargin.margin }) },
        { icon: '💰', text: t('adviceBenefit1', { amount: formatMoney(potential), money: (currentLang === 'uz' ? "so'm" : 'сум') }) },
        { icon: '🎁', text: t('adviceBenefitBonus', { n: bestMargin.product.bonus_pct }) },
      ],
    });
  }

  return advice.slice(0, 3);
}

function renderAdvice(d, innStr) {
  const root = document.getElementById('adviceList');
  if (!root) return;

  const isAdmin = !!(window.userData && window.userData.is_admin);
  if (isAdmin) { root.innerHTML = ''; return; }  // админу не показываем продающие триггеры

  const advice = generateAdvice(d, innStr);
  if (!advice.length) {
    document.getElementById('adviceSection').style.display = 'none';
    return;
  }
  document.getElementById('adviceSection').style.display = '';

  root.innerHTML = advice.map((a, idx) => `
    <div class="advice-card" onclick="adviceCtaClick('${escapeHtml(a.title).replace(/'/g, "\\'")}', '${a.type}')">
      <div class="advice-tag">
        <span class="advice-tag-icon">${a.icon}</span>
        <span class="advice-tag-text">${t('adviceTitle')}</span>
      </div>
      <div class="advice-headline">${a.title}</div>
      <div class="advice-reason">${a.reason}</div>
      <div class="advice-benefits">
        ${a.benefits.map(b => `<div class="advice-benefit"><span>${b.icon}</span><span>${b.text}</span></div>`).join('')}
      </div>
      <button class="advice-cta">${t('adviceCta')}</button>
    </div>
  `).join('');
}

window.adviceCtaClick = function(title, type) {
  trackEvent('advice_cta', { title, type });
  contactManager();
};

function renderPeerLine(peer) {
  if (!peer) return '';
  if (peer.type === 'missed') {
    return t('prodPeerMissed', { buying: peer.buying, total: peer.total });
  }
  if (peer.type === 'occasional') {
    return t('prodPeerOccasional', { top: peer.top, my: peer.my });
  }
  // active
  return t('prodPeerActive', { rank: peer.rank, region: peer.region });
}

let currentProductsProject = null; // имя проекта, экран которого сейчас открыт (для перерендера при смене языка)

window.showProjectProducts = function(projectName) {
  trackEvent('project_click', { project: projectName });
  currentProductsProject = projectName;

  // ИНН — для стабильности демо: одна и та же аптека всегда увидит ту же раскладку.
  const inn = (currentPharm && currentPharm.inn) || (window.userData && window.userData.tg_id) || 'demo';
  const products = getFakeProducts(projectName);

  // Раскладываем по статусам, считаем потенциал по "missed"
  const enriched = products.map(p => {
    const status = getProductStatus(String(inn), p.id);
    const monthlyOrders = getMonthlyOrders(String(inn), p.id, p.monthly_orders_avg);
    const potential = getQuarterlyPotential(p, monthlyOrders);
    const peer = getPeerInfo(String(inn), p.id, status, monthlyOrders);
    return { ...p, status, monthlyOrders, potential, peer };
  });

  const totalMissed = enriched.filter(x => x.status === 'missed');
  const lostBonus = totalMissed.reduce((s, x) => s + x.potential, 0);
  const activeCount = enriched.filter(x => x.status === 'active').length;
  const tryingCount = enriched.filter(x => x.status === 'occasional').length;
  const missedCount = totalMissed.length;

  renderProductsOverlay(projectName, enriched, { lostBonus, activeCount, tryingCount, missedCount });
};

function renderProductsOverlay(projectName, products, summary) {
  const overlay = document.getElementById('productsOverlay');
  if (!overlay) return;

  const moneyLabel = currentLang === 'uz' ? "so'm" : 'сум';

  const sortByPotential = [...products].sort((a, b) => b.potential - a.potential);
  const brandLetterStr = brandLetter(projectName);
  const brandClr = brandColor(projectName);

  const itemsHtml = sortByPotential.map(p => {
    const statusBadge = (() => {
      if (p.status === 'active')     return `<span class="prod-badge active">${t('prodBadgeActive')}</span>`;
      if (p.status === 'occasional') return `<span class="prod-badge tried">${t('prodBadgeTried')}</span>`;
      return `<span class="prod-badge missed">${t('prodBadgeMissed')}</span>`;
    })();

    // Маркетплейс-блок: закуп / розница / маржа — главные деловые метрики
    const margin = Math.round((p.retail - p.price) / p.price * 100);
    const profitPerUnit = p.retail - p.price;

    const pricingHtml = `
      <div class="prod-pricing">
        <div class="prod-price">
          <div class="prod-price-label">${t('prodLabelWholesale')}</div>
          <div class="prod-price-val">${formatMoney(p.price)}</div>
        </div>
        <div class="prod-price">
          <div class="prod-price-label">${t('prodLabelRetail')}</div>
          <div class="prod-price-val">${formatMoney(p.retail)}</div>
        </div>
        <div class="prod-price">
          <div class="prod-price-label">${t('prodLabelMargin')}</div>
          <div class="prod-price-val accent">+${margin}%</div>
        </div>
      </div>
      <div class="prod-profit-line">
        ${t('prodLabelProfit')}: <b>${formatMoney(profitPerUnit)} ${moneyLabel}</b>
      </div>`;

    const opportunityBlock = p.status === 'missed'
      ? `<div class="prod-opp">
           <div class="prod-opp-amount">+${formatMoney(p.potential)} ${moneyLabel}</div>
           <div class="prod-opp-sub">${t('prodCtaSub')}</div>
         </div>`
      : p.status === 'active'
        ? `<div class="prod-meta-line">${t('prodActiveMeta', { n: p.monthlyOrders, amount: formatMoney(p.potential), money: moneyLabel })}</div>`
        : `<div class="prod-meta-line">${t('prodTriedMeta', { amount: formatMoney(p.potential), money: moneyLabel })}</div>`;

    const peerLine = renderPeerLine(p.peer);
    const peerHtml = peerLine ? `<div class="prod-peer ${p.status}">${peerLine}</div>` : '';

    const actionLabel = p.status === 'missed' ? t('prodActionAdd')
                     : p.status === 'active'  ? t('prodActionKeep')
                                              : t('prodActionScale');
    const projectSafe = escapeHtml(projectName).replace(/'/g, "\\'");
    const actionBtn = `<button class="prod-action ${p.status}" onclick="productCtaClick('${projectSafe}')">${actionLabel}</button>`;

    return `
      <div class="prod-card ${p.status}">
        <div class="prod-head">
          <div class="prod-avatar" style="background: ${brandClr};">${brandLetterStr}</div>
          <div class="prod-title-block">
            <div class="prod-name">${escapeHtml(p.name)} <span class="prod-dosage">${escapeHtml(p.dosage)}</span></div>
            <div class="prod-meta">${escapeHtml(projectName)} · ${escapeHtml(p.form)}</div>
          </div>
          ${statusBadge}
        </div>
        ${pricingHtml}
        ${opportunityBlock}
        ${peerHtml}
        ${actionBtn}
      </div>
    `;
  }).join('');

  const heroText = summary.lostBonus > 0
    ? `<div class="prod-hero-amount">+${formatMoney(summary.lostBonus)} ${moneyLabel}</div>
       <div class="prod-hero-sub">${t('prodHeroSub', { n: summary.missedCount })}</div>`
    : `<div class="prod-hero-amount" style="font-size: 22px;">${t('prodHeroAllGood')}</div>
       <div class="prod-hero-sub">${t('prodHeroAllGoodSub')}</div>`;

  const finalCta = summary.lostBonus > 0
    ? `<button class="prod-final-cta" onclick="productCtaClick('${escapeHtml(projectName)}')">
         ${t('prodFinalCta', { amount: formatMoney(summary.lostBonus), money: moneyLabel })}
       </button>`
    : `<button class="prod-final-cta" onclick="productCtaClick('${escapeHtml(projectName)}')">
         ${t('prodFinalCtaNeutral')}
       </button>`;

  overlay.innerHTML = `
    <div class="prod-sheet">
      <div class="sheet-close-anchor"><button class="prod-close" onclick="closeProducts()">×</button></div>
      <div class="prod-sheet-head" data-fix-backbutton>
        <div class="prod-project-name">${escapeHtml(projectName)}</div>
        <div class="prod-project-sub">${t('prodSub', { n: products.length })}</div>
      </div>

      <div class="prod-hero">
        ${heroText}
      </div>

      <div class="prod-stats">
        <div class="prod-stat"><div class="prod-stat-num" style="color: var(--success);">${summary.activeCount}</div><div class="prod-stat-lbl">${t('prodStatActive')}</div></div>
        <div class="prod-stat"><div class="prod-stat-num" style="color: var(--warning);">${summary.tryingCount}</div><div class="prod-stat-lbl">${t('prodStatTried')}</div></div>
        <div class="prod-stat"><div class="prod-stat-num" style="color: var(--danger);">${summary.missedCount}</div><div class="prod-stat-lbl">${t('prodStatMissed')}</div></div>
      </div>

      <div class="prod-list">${itemsHtml}</div>

      <div class="prod-footer-cta">${finalCta}</div>
    </div>
  `;
  overlay.classList.add('active');
  updateBackButton();
}

window.closeProducts = function() {
  const overlay = document.getElementById('productsOverlay');
  if (overlay) overlay.classList.remove('active');
  currentProductsProject = null;
  updateBackButton();
};

window.productCtaClick = function(projectName) {
  trackEvent('project_click', { project: projectName, action: 'cta_to_manager' });
  window.closeProducts();
  contactManager();
};

function renderError(msg) {
  // Дефенсивно — на случай если лоадер ещё висит (не должны видеть ошибку
  // под полупрозрачной заглушкой).
  hideAppLoader();
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
// Шаги тура — только секции, которые реально есть в текущем дашборде.
// Невидимые (display:none) отфильтровываются при старте.
const TOUR_STEPS = [
  { sel: '#bizHero',     tKey: 'tour_earned_t', dKey: 'tour_earned' },
  { sel: '.stats-grid',  tKey: 'tour_stats_t',  dKey: 'tour_stats' },
  { sel: '#dynamicsCard',tKey: 'tour_dyn_t',    dKey: 'tour_dyn' },
  { sel: '#bonusGrid',   tKey: 'tour_bonus_t',  dKey: 'tour_bonus' },
  { sel: '#projList',    tKey: 'tour_proj_t',   dKey: 'tour_proj' },
  { sel: '.cta-manager', tKey: 'tour_cta_t',    dKey: 'tour_cta' },
];

let tourSteps = [];   // отфильтрованные видимые шаги (заполняются при старте)
let tourIndex = 0;

function tourVisible(el) {
  return el && el.offsetParent !== null && el.getClientRects().length > 0;
}

window.tourShowWelcome = function() { document.getElementById('tourWelcome').classList.add('active'); };
function tourHideWelcome() { document.getElementById('tourWelcome').classList.remove('active'); }

window.tourStart = function() {
  trackEvent('tour_started', {});
  tourHideWelcome();
  // Пока идёт тур — прячем продающие триггеры (см. CSS body.tour-active).
  document.body.classList.add('tour-active');
  // Берём только реально видимые секции — никаких "прыжков" по отсутствующим.
  tourSteps = TOUR_STEPS.filter(s => tourVisible(document.querySelector(s.sel)));
  if (!tourSteps.length) { document.body.classList.remove('tour-active'); return; }
  tourIndex = 0;
  document.getElementById('tourOverlay').classList.add('active');
  tourRender();
};

window.tourFinish = function() {
  const wasActive = document.getElementById('tourOverlay').classList.contains('active');
  trackEvent(wasActive ? 'tour_finished' : 'tour_skipped', { step: tourIndex });
  tourHideWelcome();
  document.body.classList.remove('tour-active');
  document.getElementById('tourOverlay').classList.remove('active');
  try { localStorage.setItem('datfo_tour_done', '1'); } catch (e) {}
};

window.tourNext = function() {
  if (tourIndex < tourSteps.length - 1) { tourIndex++; tourRender(); }
  else { tourFinish(); }
};
window.tourPrev = function() {
  if (tourIndex > 0) { tourIndex--; tourRender(); }
};

// Текст и кнопки тултипа — обновляем сразу, не дожидаясь скролла.
function tourSetText(step) {
  document.getElementById('tourTitle').textContent = t(step.tKey);
  document.getElementById('tourText').textContent = t(step.dKey);
  document.getElementById('tourProgress').textContent = t('tourStep', { n: tourIndex + 1, total: tourSteps.length });
  document.getElementById('tourPrevBtn').style.visibility = tourIndex === 0 ? 'hidden' : 'visible';
  document.getElementById('tourNextBtn').textContent = tourIndex === tourSteps.length - 1 ? t('tourDone') : t('tourNext');
}

// Ставим подсветку и тултип по фактической позиции элемента.
function tourPlace(el) {
  const r = el.getBoundingClientRect();
  const pad = 8;
  const sp = document.getElementById('tourSpotlight');
  sp.style.top = (r.top - pad) + 'px';
  sp.style.left = (r.left - pad) + 'px';
  sp.style.width = (r.width + pad * 2) + 'px';
  sp.style.height = (r.height + pad * 2) + 'px';

  const tt = document.getElementById('tourTooltip');
  const vh = window.innerHeight, vw = window.innerWidth;
  let top = r.bottom + 14;
  if (top + tt.offsetHeight + 20 > vh) top = Math.max(12, r.top - tt.offsetHeight - 14);
  if (top < 12) top = 12;
  const left = Math.max(12, Math.min(vw - tt.offsetWidth - 12, r.left + r.width / 2 - tt.offsetWidth / 2));
  tt.style.top = top + 'px';
  tt.style.left = left + 'px';
}

// Ждём пока smooth-скролл реально остановится (rAF следит за scrollY),
// потом один раз ставим позицию — спотлайт плавно доедет за счёт CSS-transition.
// Адаптивно: быстрый скролл — быстро, без фиксированного лага.
function tourAfterScroll(cb) {
  let lastY = window.scrollY, stable = 0, frames = 0;
  (function check() {
    frames++;
    const y = window.scrollY;
    if (Math.abs(y - lastY) < 0.5) { if (++stable >= 3) return cb(); }
    else stable = 0;
    lastY = y;
    if (frames > 50) return cb();  // страховка ~0.8 c
    requestAnimationFrame(check);
  })();
}

function tourRender() {
  const step = tourSteps[tourIndex];
  const el = document.querySelector(step.sel);
  if (!tourVisible(el)) { return window.tourNext(); }
  tourSetText(step);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  tourAfterScroll(() => tourPlace(el));
}

window.addEventListener('resize', () => {
  if (!document.getElementById('tourOverlay').classList.contains('active')) return;
  const step = tourSteps[tourIndex];
  const el = step && document.querySelector(step.sel);
  if (el) tourPlace(el);  // на ресайз — мгновенно, без ожидания скролла
});

window.addEventListener('load', () => {
  setTimeout(() => {
    try {
      if (userData && userData.is_admin) return; // админам тур не нужен
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

// ============================================================
// EVENT TRACKING (fire-and-forget POST /api/events)
// ============================================================
function trackEvent(name, payload) {
  try {
    const initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
    const urlParams = new URLSearchParams(window.location.search);
    const tgIdFromUrl = urlParams.get('tg_id');
    const url = new URL(API_BASE + '/api/events');
    if (initData) url.searchParams.set('init_data', initData);
    else if (tgIdFromUrl) url.searchParams.set('tg_id', tgIdFromUrl);

    const body = {
      event: name,
      pharmacy_inn: currentPharmInn || null,
      payload: payload || {},
    };
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        ...(initData ? { 'X-Telegram-Init-Data': initData } : {}),
      },
      body: JSON.stringify(body),
      keepalive: true,  // позволяет запросу долететь даже если страницу закрыли
    }).catch(() => { /* тихо игнорируем — трекинг не критичен */ });
  } catch (e) {
    /* трекинг не должен ломать UI */
  }
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
