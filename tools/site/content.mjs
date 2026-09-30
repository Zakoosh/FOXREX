/* Static, factual site copy for the FOXREX public website.
   Market data, analysis, news and signal results are NOT stored here — they
   come from data/content.json at runtime and show an unavailable state when empty. */

export const SITE = {
  origin: 'https://foxrex.co',
  name: 'FOXREX',
  tagline: 'TRADE SMARTER. GO FURTHER.',
  taglineAr: 'تداول أذكى... فرص أكبر',
  description: 'FOXREX is a market-intelligence and trading-education brand: technical analysis, gold coverage, economic news and FOXREX Signals, with clear risk awareness.',
  social: {
    telegram: { label: 'Telegram', handle: '@fooxrex', url: 'https://t.me/fooxrex' },
    instagram: { label: 'Instagram', handle: '@foxrextrade', url: 'https://www.instagram.com/foxrextrade' },
    facebook: { label: 'Facebook', handle: 'foxrextrade', url: 'https://www.facebook.com/foxrextrade' },
    whatsapp: { label: 'WhatsApp', handle: null, url: null } // channel not published yet
  }
};

/* Market coverage (descriptive only — no prices) */
export const MARKETS = [
  { sym: 'XAUUSD', name: ['Gold / US Dollar', 'الذهب / الدولار الأمريكي'], cls: ['Commodities', 'السلع'],
    about: ['The price of one troy ounce of gold in US dollars. Sensitive to real yields, the dollar, risk sentiment and central-bank demand.', 'سعر أونصة الذهب بالدولار الأمريكي. يتأثر بالعوائد الحقيقية والدولار ومعنويات المخاطرة وطلب البنوك المركزية.'] },
  { sym: 'EURUSD', name: ['Euro / US Dollar', 'اليورو / الدولار الأمريكي'], cls: ['FX majors', 'العملات الرئيسية'],
    about: ['The most traded currency pair. Driven by the policy gap between the ECB and the Federal Reserve and by relative growth.', 'أكثر أزواج العملات تداولًا. يتحرك بفارق السياسات بين المركزي الأوروبي والاحتياطي الفيدرالي وبفارق النمو.'] },
  { sym: 'GBPUSD', name: ['British Pound / US Dollar', 'الجنيه الإسترليني / الدولار الأمريكي'], cls: ['FX majors', 'العملات الرئيسية'],
    about: ['Cable. Reacts to Bank of England decisions, UK inflation and labour data, and broad US dollar moves.', 'الكيبل. يتفاعل مع قرارات بنك إنجلترا وبيانات التضخم والتوظيف البريطانية وحركة الدولار.'] },
  { sym: 'USDJPY', name: ['US Dollar / Japanese Yen', 'الدولار الأمريكي / الين الياباني'], cls: ['FX majors', 'العملات الرئيسية'],
    about: ['Closely tied to the yield gap between US Treasuries and Japanese government bonds, and to Bank of Japan policy.', 'مرتبط بفارق العوائد بين السندات الأمريكية واليابانية وبسياسة بنك اليابان.'] },
  { sym: 'BTCUSD', name: ['Bitcoin / US Dollar', 'البيتكوين / الدولار الأمريكي'], cls: ['Crypto', 'العملات الرقمية'],
    about: ['Trades around the clock and is highly volatile. Influenced by liquidity conditions, flows and regulation.', 'يتداول على مدار الساعة وشديد التقلب. يتأثر بالسيولة والتدفقات والتنظيمات.'] },
  { sym: 'DXY', name: ['US Dollar Index', 'مؤشر الدولار الأمريكي'], cls: ['Indices', 'المؤشرات'],
    about: ['Measures the dollar against a basket of six major currencies, with the euro as the largest weight.', 'يقيس الدولار مقابل سلة من ست عملات رئيسية، واليورو صاحب الوزن الأكبر.'] }
];

/* Daily editorial system — times are Europe/Istanbul (UTC+3) */
export const SCHEDULE = [
  { id: 'brief', time: '09:00', kind: 'brief', title: ['Morning Brief', 'الموجز الصباحي'], desc: ['What moved overnight, what matters today and the levels we are watching.', 'ما تحرك خلال الليل، وما يهم اليوم، والمستويات التي نراقبها.'] },
  { id: 'gold', time: '11:00', kind: 'gold', title: ['Gold Focus', 'تركيز الذهب'], desc: ['Structure, bias and scenarios for XAUUSD.', 'البنية والاتجاه والسيناريوهات للذهب XAUUSD.'] },
  { id: 'event', time: '14:00', kind: 'event', title: ['The Event', 'الحدث'], desc: ['The key release or decision of the day — published only when relevant.', 'أهم بيان أو قرار في اليوم — يُنشر فقط عند وجود حدث مهم.'] },
  { id: 'open', time: '15:30', kind: 'open', title: ['US Open', 'افتتاح السوق الأمريكي'], desc: ['Positioning and volatility into the New York session.', 'التمركز والتقلب مع افتتاح جلسة نيويورك.'] },
  { id: 'recap', time: '22:30', kind: 'recap', title: ['Market Recap', 'ملخص السوق'], desc: ['How the day closed and what it means for tomorrow.', 'كيف أغلق اليوم وماذا يعني ذلك للغد.'] }
];
export const SCHEDULE_EXTRA = [
  { time: ['Real-time', 'لحظي'], title: ['Breaking / Data Released', 'عاجل / صدور البيانات'] },
  { time: ['19:00', '19:00'], title: ['REX Explains / REX Note', 'REX يشرح / ملاحظة REX'] }
];

export const ANALYSIS_CATEGORIES = [
  ['all', 'All', 'الكل'], ['technical', 'Technical Analysis', 'التحليل الفني'], ['macro', 'Macro', 'الاقتصاد الكلي'],
  ['gold', 'Gold', 'الذهب'], ['fx', 'FX', 'العملات'], ['indices', 'Indices', 'المؤشرات'], ['crypto', 'Crypto', 'العملات الرقمية']
];
export const NEWS_CATEGORIES = [
  ['latest', 'Latest', 'الأحدث'], ['high', 'High Impact', 'تأثير مرتفع'], ['economic', 'Economic', 'اقتصادي'],
  ['central-banks', 'Central Banks', 'البنوك المركزية'], ['commodities', 'Commodities', 'السلع'], ['fx', 'FX', 'العملات']
];

/* REX education — factual explainers (not market calls) */
export const REX = [
  { id: 'what-is-cpi', type: 'REX EXPLAINS',
    title: ['What is CPI?', 'ما هو مؤشر أسعار المستهلك CPI؟'],
    summary: ['The inflation report that can move every market in minutes.', 'تقرير التضخم الذي قد يحرك كل الأسواق خلال دقائق.'],
    body: [
      ['The Consumer Price Index (CPI) measures the average change in prices that households pay for a basket of goods and services, such as food, energy, rent and transport. In the US it is published monthly by the Bureau of Labor Statistics.',
       'Markets watch both headline CPI and core CPI, which excludes food and energy because those prices are volatile. A reading above expectations suggests inflation is sticky, which can push the Federal Reserve to keep interest rates higher for longer.'],
      ['يقيس مؤشر أسعار المستهلك متوسط التغير في الأسعار التي تدفعها الأسر مقابل سلة من السلع والخدمات مثل الغذاء والطاقة والإيجار والنقل. وفي الولايات المتحدة يصدر شهريًا عن مكتب إحصاءات العمل.',
       'تراقب الأسواق الرقم الرئيسي والرقم الأساسي الذي يستبعد الغذاء والطاقة لتقلب أسعارهما. القراءة الأعلى من التوقعات تعني تضخمًا عنيدًا، ما قد يدفع الاحتياطي الفيدرالي إلى إبقاء الفائدة مرتفعة لفترة أطول.']
    ],
    takeaway: ['What matters is the surprise versus the forecast, not the number alone.', 'المهم هو الفارق عن التوقعات، لا الرقم وحده.'] },
  { id: 'gold-and-yields', type: 'REX EXPLAINS',
    title: ['Why does gold react to yields?', 'لماذا يتأثر الذهب بالعوائد؟'],
    summary: ['Gold pays no interest — so the return on bonds is its competition.', 'الذهب لا يدفع فائدة، لذلك عائد السندات هو منافسه المباشر.'],
    body: [
      ['Gold does not pay interest or dividends. When bond yields rise — especially real yields, which are yields after inflation — holding gold means giving up a higher safe return. That opportunity cost tends to weigh on gold.',
       'When real yields fall, the cost of holding gold drops and it often becomes more attractive. The US dollar matters too: gold is priced in dollars, so a stronger dollar can make it more expensive for other buyers. These relationships are tendencies, not rules, and they can break during crises or heavy central-bank buying.'],
      ['الذهب لا يدفع فائدة أو توزيعات. عندما ترتفع عوائد السندات، خاصة العوائد الحقيقية بعد خصم التضخم، يصبح الاحتفاظ بالذهب تخليًا عن عائد آمن أعلى، وهذه التكلفة البديلة تضغط عادة على الذهب.',
       'وعندما تنخفض العوائد الحقيقية تقل تكلفة الاحتفاظ بالذهب فيصبح أكثر جاذبية. ويؤثر الدولار أيضًا، فالذهب مسعّر بالدولار وقوة الدولار قد ترفع كلفته على باقي المشترين. هذه علاقات غالبة لا قواعد ثابتة، وقد تنكسر في الأزمات أو مع مشتريات البنوك المركزية الكبيرة.']
    ],
    takeaway: ['Watch real yields and the dollar together, not in isolation.', 'راقب العوائد الحقيقية والدولار معًا لا كلًا على حدة.'] },
  { id: 'what-is-a-breakout', type: 'REX EXPLAINS',
    title: ['What is a breakout?', 'ما هو الاختراق؟'],
    summary: ['When price leaves a range — and why many breakouts fail.', 'عندما يغادر السعر نطاقه، ولماذا تفشل اختراقات كثيرة.'],
    body: [
      ['A breakout happens when price moves decisively beyond a level that previously contained it, such as the top of a range or a trendline. Traders look for it because it can signal the start of a new move.',
       'Many breakouts fail and reverse — often called false breakouts. Confirmation such as a candle close beyond the level, a successful retest, or rising participation helps separate real breaks from noise. A clear invalidation level is essential before acting.'],
      ['يحدث الاختراق عندما يتحرك السعر بوضوح خارج مستوى كان يحصره سابقًا، مثل قمة نطاق أو خط اتجاه. يبحث عنه المتداولون لأنه قد يشير إلى بداية حركة جديدة.',
       'لكن كثيرًا من الاختراقات يفشل وينعكس، وهو ما يسمى الاختراق الكاذب. التأكيد بإغلاق شمعة خارج المستوى أو إعادة اختبار ناجحة أو زيادة المشاركة يساعد على التمييز بين الاختراق الحقيقي والضجيج. ويجب تحديد مستوى الإلغاء بوضوح قبل التنفيذ.']
    ],
    takeaway: ['A breakout without a plan for failure is a guess.', 'الاختراق دون خطة للفشل مجرد تخمين.'] },
  { id: 'market-structure', type: 'REX NOTE',
    title: ['What is market structure?', 'ما هي بنية السوق؟'],
    summary: ['Reading trends through highs and lows.', 'قراءة الاتجاه من خلال القمم والقيعان.'],
    body: [
      ['Market structure describes how price builds its swings. An uptrend prints higher highs and higher lows; a downtrend prints lower highs and lower lows. When neither pattern holds, the market is ranging.',
       'A break of structure — for example, price falling below the last higher low in an uptrend — is an early warning that the trend may be weakening. Structure gives context: it tells you which side has control before you look at any indicator.'],
      ['تصف بنية السوق طريقة تشكل موجات السعر. الاتجاه الصاعد يصنع قممًا أعلى وقيعانًا أعلى، والهابط يصنع قممًا أدنى وقيعانًا أدنى، وإذا لم يتحقق أي منهما فالسوق في نطاق عرضي.',
       'كسر البنية، مثل هبوط السعر تحت آخر قاع أعلى في اتجاه صاعد، إنذار مبكر بضعف الاتجاه. البنية تعطيك السياق وتخبرك من يسيطر قبل النظر إلى أي مؤشر.']
    ],
    takeaway: ['Structure first, indicators second.', 'البنية أولًا، ثم المؤشرات.'] },
  { id: 'risk-reward', type: 'REX EXPLAINS',
    title: ['What is risk/reward?', 'ما هي نسبة المخاطرة إلى العائد؟'],
    summary: ['Comparing what you can lose with what you aim to gain.', 'مقارنة ما قد تخسره بما تسعى إلى كسبه.'],
    body: [
      ['Risk/reward compares the distance from your entry to your stop-loss (the risk) with the distance to your target (the reward). Risking 20 points to aim for 40 points is a 1:2 risk/reward.',
       'A favourable ratio does not make a trade good on its own — the probability of reaching the target matters just as much. Position sizing then decides how much of your account that risk represents. Many traders cap risk per trade at a small, fixed percentage of their capital.'],
      ['تقارن نسبة المخاطرة إلى العائد بين المسافة من الدخول إلى وقف الخسارة (المخاطرة) والمسافة إلى الهدف (العائد). المخاطرة بـ 20 نقطة لاستهداف 40 نقطة تعني نسبة 1:2.',
       'النسبة الجيدة لا تجعل الصفقة جيدة وحدها، فاحتمال الوصول إلى الهدف لا يقل أهمية. ثم يحدد حجم المركز نسبة هذه المخاطرة من حسابك، ويحدد كثير من المتداولين سقفًا صغيرًا وثابتًا للمخاطرة في كل صفقة.']
    ],
    takeaway: ['Decide the stop before the entry — never after.', 'حدد وقف الخسارة قبل الدخول، لا بعده.'] }
];
