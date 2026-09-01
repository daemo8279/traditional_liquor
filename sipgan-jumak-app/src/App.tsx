import { useMemo, useState } from 'react';
import liquorsData from './data/liquors.json';
import tenganData from './data/tengan.json';
import zhiData from './data/zhi.json';
import type { Liquor, TenganProfile, ZhiProfile, GanZhiProfile, TasteAnswers, SituAnswers, SituLabel, BanjuLabel, DerivedAxis } from './lib/types';
import { calcDayPillar } from './lib/tengan';
import { combineGanZhi } from './lib/ganzhi';
import {
  computeStats, tasteWeights, situationWeights, tenganWeights,
  buildWeightB, buildWeightC, recommend, type ScoredLiquor,
} from './lib/algorithm';
import './App.css';

const liquors = liquorsData as unknown as Liquor[];
const tenganList = tenganData as unknown as TenganProfile[];
const zhiList = zhiData as unknown as ZhiProfile[];
const stats = computeStats(liquors);

type Step = 'intro' | 'birth' | 'T1' | 'T2' | 'T3' | 'T4' | 'S1' | 'S2' | 'S3' | 'S4' | 'result';
const STEP_ORDER: Step[] = ['intro', 'birth', 'T1', 'T2', 'T3', 'T4', 'S1', 'S2', 'S3', 'S4', 'result'];
// 진행률 표시는 실제 '질문' 단계(8개: T1~T4, S1~S4)만 카운트한다. intro/birth/result는 제외.
const QUESTION_STEPS: Step[] = ['T1', 'T2', 'T3', 'T4', 'S1', 'S2', 'S3', 'S4'];

const GAN_HANJA_ONLY: Record<string, string> = {
  갑목: '甲', 을목: '乙', 병화: '丙', 정화: '丁', 무토: '戊',
  기토: '己', 경금: '庚', 신금: '辛', 임수: '壬', 계수: '癸',
};

const RADAR_AXES: DerivedAxis[] = ['확장성', '강렬성', '안정성', '정제감', '유연성'];

function polarPoint(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = (Math.PI / 180) * angleDeg;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function RadarChart({ axes, size = 220 }: { axes: Record<DerivedAxis, number>; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 34;
  const n = RADAR_AXES.length;
  const angleStep = 360 / n;
  const startAngle = -90;

  const valuePoints = RADAR_AXES.map((ax, i) => {
    const angle = startAngle + i * angleStep;
    const val = axes[ax] ?? 0;
    const r = (val / 5) * maxR;
    return polarPoint(cx, cy, r, angle);
  });
  const valuePath = valuePoints.map((p) => p.join(',')).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="radar-chart">
      {[1, 2, 3, 4, 5].map((lvl) => {
        const r = (lvl / 5) * maxR;
        const pts = RADAR_AXES.map((_, i) => polarPoint(cx, cy, r, startAngle + i * angleStep).join(',')).join(' ');
        return <polygon key={lvl} points={pts} className="radar-grid" />;
      })}
      {RADAR_AXES.map((_, i) => {
        const [x, y] = polarPoint(cx, cy, maxR, startAngle + i * angleStep);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="radar-axis-line" />;
      })}
      <polygon points={valuePath} className="radar-value" />
      {valuePoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} className="radar-dot" />
      ))}
      {RADAR_AXES.map((ax, i) => {
        const [x, y] = polarPoint(cx, cy, maxR + 22, startAngle + i * angleStep);
        return (
          <text key={ax} x={x} y={y} className="radar-label" textAnchor="middle" dominantBaseline="middle">
            {ax}
          </text>
        );
      })}
    </svg>
  );
}

function TenganIcon({ gan }: { gan: string }) {
  switch (gan) {
    case '갑목': // 소나무
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" className="tengan-icon" aria-hidden="true">
          <line x1="20" y1="26" x2="20" y2="36" className="ti-trunk" />
          <path d="M20 4 L28 16 H12 Z" className="ti-fill" />
          <path d="M20 11 L30 24 H10 Z" className="ti-fill" />
          <path d="M20 18 L32 32 H8 Z" className="ti-fill" />
        </svg>
      );
    case '을목': // 꽃
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" className="tengan-icon" aria-hidden="true">
          <line x1="20" y1="24" x2="20" y2="36" className="ti-trunk" />
          <circle cx="20" cy="16" r="4" className="ti-flame" />
          <circle cx="13" cy="20" r="4" className="ti-fill" />
          <circle cx="27" cy="20" r="4" className="ti-fill" />
          <circle cx="15" cy="11" r="4" className="ti-fill" />
          <circle cx="25" cy="11" r="4" className="ti-fill" />
        </svg>
      );
    case '병화': // 태양
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" className="tengan-icon" aria-hidden="true">
          <circle cx="20" cy="20" r="8" className="ti-flame" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const rad = (Math.PI / 180) * a;
            const x1 = 20 + Math.cos(rad) * 12, y1 = 20 + Math.sin(rad) * 12;
            const x2 = 20 + Math.cos(rad) * 17, y2 = 20 + Math.sin(rad) * 17;
            return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} className="ti-ray" />;
          })}
        </svg>
      );
    case '정화': // 촛불
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" className="tengan-icon" aria-hidden="true">
          <ellipse cx="20" cy="12" rx="4" ry="6" className="ti-flame" />
          <rect x="15" y="20" width="10" height="14" rx="1.5" className="ti-fill" />
          <line x1="14" y1="20" x2="26" y2="20" className="ti-rim" />
        </svg>
      );
    case '무토': // 큰 산
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" className="tengan-icon" aria-hidden="true">
          <path d="M4 32 L15 12 L22 22 L27 15 L36 32 Z" className="ti-fill" />
          <path d="M12 17 L15 12 L18 17 Z" className="ti-snow" />
        </svg>
      );
    case '기토': // 들판
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" className="tengan-icon" aria-hidden="true">
          <line x1="4" y1="30" x2="36" y2="30" className="ti-rim" />
          {[6, 11, 16, 21, 26, 31, 36].map((x) => (
            <path key={x} d={`M${x} 30 Q${x - 2} 22 ${x} 14 Q${x + 2} 22 ${x} 30`} className="ti-blade" />
          ))}
        </svg>
      );
    case '경금': // 보석
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" className="tengan-icon" aria-hidden="true">
          <path d="M12 10 H28 L34 18 L20 34 L6 18 Z" className="ti-fill" />
          <path d="M12 10 L20 18 L28 10 M6 18 H34 M20 18 L20 34" className="ti-facet" />
        </svg>
      );
    case '신금': // 쌍칼
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" className="tengan-icon" aria-hidden="true">
          <line x1="8" y1="8" x2="30" y2="30" className="ti-blade-line" />
          <line x1="6" y1="14" x2="14" y2="6" className="ti-hilt" />
          <line x1="32" y1="8" x2="10" y2="30" className="ti-blade-line" />
          <line x1="34" y1="14" x2="26" y2="6" className="ti-hilt" />
        </svg>
      );
    case '임수': // 호수
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" className="tengan-icon" aria-hidden="true">
          <circle cx="20" cy="11" r="4" className="ti-flame" />
          <path d="M4 22 Q10 18 16 22 T28 22 T36 22" className="ti-wave" />
          <path d="M4 29 Q10 25 16 29 T28 29 T36 29" className="ti-wave" />
        </svg>
      );
    case '계수': // 안개
      return (
        <svg width="40" height="40" viewBox="0 0 40 40" className="tengan-icon" aria-hidden="true">
          <path d="M6 14 Q13 10 20 14 T34 14" className="ti-mist" />
          <path d="M4 21 Q13 16 22 21 T36 21" className="ti-mist" />
          <path d="M8 28 Q15 24 22 28 T34 28" className="ti-mist" />
        </svg>
      );
    default:
      return null;
  }
}

// 10천간 한자를 좁은 목 -> 둥근 몸통 -> 좁은 굽으로 배치해, 달항아리(백자 달항아리) 실루엣을
// 글자만으로 그려낸다. 아래 outline path는 그 실루엣을 은은하게 받쳐주는 보조선.
const JAR_ROWS: { chars: string[]; y: number }[] = [
  { chars: ['갑목'], y: 52 },
  { chars: ['을목', '병화'], y: 86 },
  { chars: ['정화', '무토', '기토'], y: 120 },
  { chars: ['경금', '신금', '임수'], y: 154 },
  { chars: ['계수'], y: 186 },
];
const JAR_ROW_X: number[][] = [[100], [75, 125], [55, 100, 145], [58, 100, 142], [100]];

function MoonJarIcon() {
  return (
    <svg width="168" height="184" viewBox="0 0 200 220" className="jar-icon" aria-hidden="true">
      <path
        className="jar-outline"
        d="M82,14 Q82,26 68,34 Q20,62 16,120 Q14,160 40,188 Q70,208 100,208
           Q130,208 160,188 Q186,160 184,120 Q180,62 132,34 Q118,26 118,14 Z"
      />
      {JAR_ROWS.map((row, ri) =>
        row.chars.map((gan, ci) => (
          <text
            key={gan}
            x={JAR_ROW_X[ri][ci]}
            y={row.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="jar-char"
            style={{ fill: `var(--gan-${gan})` }}
          >
            {GAN_HANJA_ONLY[gan]}
          </text>
        )),
      )}
    </svg>
  );
}

const SITU_OPTIONS: SituLabel[] = ['혼술', '식사', '데이트', '모임·파티', '특별한 날·선물'];
const SITU_EMOJI: Record<SituLabel, string> = {
  '혼술': '🌙', '식사': '🍚', '데이트': '💐', '모임·파티': '🎉', '특별한 날·선물': '🎁',
};
const BANJU_OPTIONS: BanjuLabel[] = ['전·튀김', '육류·구이', '해산물·회', '치즈·디저트·과일', '나물·두부·매콤한 안주', '없음'];
const BANJU_EMOJI: Record<BanjuLabel, string> = {
  '전·튀김': '🍤', '육류·구이': '🍖', '해산물·회': '🐟', '치즈·디저트·과일': '🍇', '나물·두부·매콤한 안주': '🌶️', '없음': '🚫',
};

const TASTE_LABELS: Record<keyof TasteAnswers, { q: string; opts: string[]; emoji: string[] }> = {
  T1: {
    q: '오늘 술의 단맛, 어느 정도가 좋으세요?',
    opts: ['완전 드라이', '은은한 단맛', '중간', '단맛 좋아함', '매우 달콤하게'],
    emoji: ['🌾', '🍯', '⚖️', '🍬', '🍭'],
  },
  T2: {
    q: '가볍고 산뜻한 쪽 vs 묵직하고 진한 쪽?',
    opts: ['아주 가볍게', '산뜻하게', '중간', '진하게', '아주 묵직하게'],
    emoji: ['💧', '🌊', '⚖️', '🍫', '🪨'],
  },
  T3: {
    q: '고소한 곡물·누룩향 vs 과일·꽃향, 뭐가 더 끌리세요?',
    opts: ['곡물·누룩 쪽', '약간 곡물', '둘 다 좋음', '약간 과일', '과일·꽃 쪽'],
    emoji: ['🌾', '🌾', '⚖️', '🍑', '🌸'],
  },
  T4: {
    q: '알콜의 쌉싸래한 향은 얼마나 즐기시나요?',
    opts: ['거의 안 느껴지게', '은은하게', '중간', '분명하게', '강렬하게'],
    emoji: ['🫧', '🥂', '⚖️', '🔥', '⚡'],
  },
};

const S3_EMOJI: Record<string, string> = { '가볍게': '🍃', '보통': '⚖️', '진하게': '🥃' };
const S4_EMOJI = ['🧸', '🙂', '⚖️', '✨', '🚀'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function buildShareText(profile: GanZhiProfile, results: { b: { top3: ScoredLiquor[] }; c: { top3: ScoredLiquor[] } }): string {
  const bName = results.b.top3[0]?.liquor.name ?? '-';
  const cName = results.c.top3[0]?.liquor.name ?? '-';
  return (
    `🍶 십천간주막 — 오늘의 결과\n` +
    `나의 일주: ${profile.label}일주 (${profile.hanjaLabel})\n` +
    `사주가 추천하는 술: ${bName}\n` +
    `취향·상황에 맞는 술: ${cName}\n\n` +
    `나도 오늘의 전통주 찾아보기 👉 ${typeof window !== 'undefined' ? window.location.origin : ''}`
  );
}

function liquorSummary(l: Liquor): string {
  return `${l.name}은 ${l.category}·${l.subtype}로, ${l.tasteNote} 등이 특징인 술입니다.`;
}

function buildTasteExplanation(l: Liquor, situ: SituLabel): string {
  return `${liquorSummary(l)} 그래서 이 술은 ${situ} 같은 오늘의 상황과 당신의 취향에 적합한 술이에요.`;
}

function buildGanExplanation(l: Liquor, combined: GanZhiProfile): string {
  return `${liquorSummary(l)} ${combined.traitPhrase} 성향인 당신에게 어울리는 한 잔입니다.`;
}

function LiquorCard({
  item, explanation, accentClass, label,
}: { item: ScoredLiquor; explanation: string; accentClass: string; label: string }) {
  const l = item.liquor;
  const chips = [
    `${l.abv}%`,
    l.category,
    ...(l.tasteNote ? l.tasteNote.split(/[,·、]/).map((s) => s.trim()).filter(Boolean).slice(0, 2) : []),
  ].slice(0, 4);
  return (
    <div className={`rec-card ${accentClass}`}>
      <div className="rec-label">{label}</div>
      <div className="liquor-name">{l.name}</div>
      <div className="chip-row">
        {chips.map((c, i) => (
          <span key={i} className="chip">{c}</span>
        ))}
      </div>
      <p className="liquor-explain">{explanation}</p>
      <div className="liquor-links">
        {l.buyUrl && (
          <a href={l.buyUrl} target="_blank" rel="noopener noreferrer" className="liquor-link liquor-link-buy">
            오늘의 술 사러 가기
          </a>
        )}
        {l.refUrl && (
          <a href={l.refUrl} target="_blank" rel="noopener noreferrer" className="liquor-link liquor-link-info">
            오늘의 술 정보 보기
          </a>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-label">{Math.min(current + 1, total)}/{total}</div>
    </div>
  );
}

function ChoiceCard<T,>({
  groupLabel, idx, total, question, options, selected, onSelect, onBack,
}: {
  groupLabel: string;
  idx: number;
  total: number;
  question: string;
  options: { label: string; value: T; emoji?: string }[];
  selected: T;
  onSelect: (v: T) => void;
  onBack: () => void;
}) {
  return (
    <section className="card step-card question-card">
      <h2>{groupLabel} ({idx}/{total})</h2>
      <div className="qtext qtext-solo">{question}</div>
      <div className="opt-col">
        {options.map((opt, i) => {
          const active = selected === opt.value;
          return (
            <button
              key={i}
              className={`opt-btn-v ${active ? 'active' : ''}`}
              onClick={() => onSelect(opt.value)}
            >
              {opt.emoji && <span className="opt-emoji">{opt.emoji}</span>}
              <span className="opt-label">{opt.label}</span>
              <span className="opt-check">✓</span>
            </button>
          );
        })}
      </div>
      <div className="nav-row nav-row-single">
        <button className="btn-secondary" onClick={onBack}>이전</button>
      </div>
    </section>
  );
}

function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <section className="intro-screen">
      <MoonJarIcon />
      <h1 className="intro-title">십천간주막</h1>
      <p className="intro-desc">
        태어난 날의 일주(日柱)와 오늘의 취향·상황을 더해, 매일 다른 전통주 한 병을 권해드립니다.
      </p>
      <button className="intro-cta" onClick={onStart}>내 술 찾으러 가기</button>
      <p className="intro-footnote">입력한 생년월일 정보는 저장하지 않아요.</p>
    </section>
  );
}

export default function App() {
  const [step, setStep] = useState<Step>('intro');
  const [birth, setBirth] = useState('');
  const [birthError, setBirthError] = useState('');
  const [taste, setTaste] = useState<TasteAnswers>({ T1: 3, T2: 3, T3: 3, T4: 3 });
  const [situ, setSitu] = useState<SituAnswers>({ S1: '혼술', S2: [], S3: '보통', S4: 3 });
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const pillar = useMemo(() => {
    if (!birth) return null;
    try {
      return calcDayPillar(birth);
    } catch {
      return null;
    }
  }, [birth]);

  const profile: GanZhiProfile | null = useMemo(() => {
    if (!pillar) return null;
    const gan = tenganList.find((t) => t.gan === pillar.gan);
    const zhi = zhiList.find((z) => z.zhi === pillar.zhi);
    if (!gan || !zhi) return null;
    return combineGanZhi(gan, zhi);
  }, [pillar]);

  const results = useMemo(() => {
    if (!profile) return null;
    const tw = tasteWeights(taste, situ.S3);
    const sw = situationWeights(situ);
    const gw = tenganWeights(profile.weightAxes5);
    const weightB = buildWeightB(tw, sw, gw);
    const weightC = buildWeightC(tw, sw);
    const today = todayStr();
    const b = recommend(weightB, liquors, stats, situ.S2, today, 1);
    const c = recommend(weightC, liquors, stats, situ.S2, today, 1);
    return { b, c };
  }, [profile, taste, situ]);

  function stepIndex(s: Step) {
    return STEP_ORDER.indexOf(s);
  }
  function goNext() {
    setStep(STEP_ORDER[Math.min(stepIndex(step) + 1, STEP_ORDER.length - 1)]);
  }
  function goPrev() {
    setStep(STEP_ORDER[Math.max(stepIndex(step) - 1, 0)]);
  }

  function submitBirth() {
    if (!birth) { setBirthError('생년월일을 입력해주세요.'); return; }
    try {
      calcDayPillar(birth);
      setBirthError('');
      goNext();
    } catch (e) {
      setBirthError('날짜를 다시 확인해주세요.');
    }
  }

  async function handleShare() {
    if (!profile || !results) return;
    const text = buildShareText(profile, results);
    const shareUrl = typeof window !== 'undefined' ? window.location.href : undefined;
    try {
      if (navigator.share) {
        await navigator.share({ title: '십천간주막 — 오늘의 결과', text, url: shareUrl });
        return;
      }
      throw new Error('no-web-share');
    } catch (e) {
      // 사용자가 공유를 취소한 경우(AbortError)는 아무것도 하지 않는다.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(text);
        setShareStatus('copied');
        setTimeout(() => setShareStatus('idle'), 2500);
      } catch {
        setShareStatus('error');
        setTimeout(() => setShareStatus('idle'), 2500);
      }
    }
  }

  function toggleBanju(opt: BanjuLabel) {
    setSitu((s) => {
      if (opt === '없음') {
        return { ...s, S2: s.S2.includes('없음') ? [] : ['없음'] };
      }
      const withoutNone = s.S2.filter((o) => o !== '없음');
      const has = withoutNone.includes(opt);
      return { ...s, S2: has ? withoutNone.filter((o) => o !== opt) : [...withoutNone, opt] };
    });
  }

  const qStepPos = QUESTION_STEPS.indexOf(step);
  const ganColorVar = profile ? `var(--gan-${profile.gan.gan})` : undefined;

  return (
    <div className="shell">
      {step !== 'intro' && step !== 'result' && (
        <header className="masthead">
          <div className="kicker">酒 TRADITIONAL LIQUOR × SAJU</div>
          <h1>십천간주막</h1>
        </header>
      )}

      {qStepPos !== -1 && (
        <ProgressBar current={qStepPos} total={QUESTION_STEPS.length} />
      )}

      {step === 'intro' && <IntroScreen onStart={goNext} />}

      {step === 'birth' && (
        <section className="card step-card">
          <h2>당신이 태어난 날을 알려주세요</h2>
          <p className="hint">양력 날짜만 입력해주세요.</p>
          <p className="hint">음력 생일이시면 만세력 앱에 음력으로 입력해 변환된 양력 날짜를 확인한 후 입력해주세요.</p>
          <div className="field-label">생년월일</div>
          <input
            type="date"
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
            className="date-input"
          />
          {birthError && <p className="error">{birthError}</p>}
          <p className="privacy-note">입력한 생년월일 정보는 저장하지 않아요.</p>
          <button className="btn-primary" onClick={submitBirth}>다음</button>
        </section>
      )}

      {(['T1', 'T2', 'T3', 'T4'] as const).map(
        (key, i) =>
          step === key && (
            <ChoiceCard
              key={key}
              groupLabel="취향"
              idx={i + 1}
              total={4}
              question={TASTE_LABELS[key].q}
              options={TASTE_LABELS[key].opts.map((label, oi) => ({ label, value: oi + 1, emoji: TASTE_LABELS[key].emoji[oi] }))}
              selected={taste[key]}
              onSelect={(v) => { setTaste((t) => ({ ...t, [key]: v })); goNext(); }}
              onBack={goPrev}
            />
          ),
      )}

      {step === 'S1' && (
        <ChoiceCard
          groupLabel="상황"
          idx={1}
          total={4}
          question="오늘은 어떤 자리인가요?"
          options={SITU_OPTIONS.map((opt) => ({ label: opt, value: opt, emoji: SITU_EMOJI[opt] }))}
          selected={situ.S1}
          onSelect={(v) => { setSitu((s) => ({ ...s, S1: v })); goNext(); }}
          onBack={goPrev}
        />
      )}

      {step === 'S2' && (
        <section className="card step-card question-card">
          <h2>상황 (2/4)</h2>
          <div className="qtext qtext-solo">함께 먹을 안주가 있다면? (복수 선택 가능)</div>
          <div className="opt-col">
            {BANJU_OPTIONS.map((opt) => {
              const active = situ.S2.includes(opt);
              return (
                <button
                  key={opt}
                  className={`opt-btn-v ${active ? 'active' : ''}`}
                  onClick={() => toggleBanju(opt)}
                >
                  <span className="opt-emoji">{BANJU_EMOJI[opt]}</span>
                  <span className="opt-label">{opt}</span>
                  <span className="opt-check">✓</span>
                </button>
              );
            })}
          </div>
          <div className="nav-row">
            <button className="btn-secondary" onClick={goPrev}>이전</button>
            <button className="btn-primary" onClick={goNext}>다음</button>
          </div>
        </section>
      )}

      {step === 'S3' && (
        <ChoiceCard
          groupLabel="상황"
          idx={3}
          total={4}
          question="가볍게 한 잔 vs 오늘만큼은 진하게?"
          options={(['가볍게', '보통', '진하게'] as const).map((opt) => ({ label: opt, value: opt, emoji: S3_EMOJI[opt] }))}
          selected={situ.S3}
          onSelect={(v) => { setSitu((s) => ({ ...s, S3: v })); goNext(); }}
          onBack={goPrev}
        />
      )}

      {step === 'S4' && (
        <ChoiceCard
          groupLabel="상황"
          idx={4}
          total={4}
          question="오늘은 익숙한 술이 좋으세요, 새로운 술에 도전해보고 싶으세요?"
          options={['아주 익숙한 것', '무난한 것', '중간', '개성 있는 것', '완전 새로운 것'].map((label, i) => ({ label, value: i + 1, emoji: S4_EMOJI[i] }))}
          selected={situ.S4}
          onSelect={(v) => { setSitu((s) => ({ ...s, S4: v })); setStep('result'); }}
          onBack={goPrev}
        />
      )}

      {step === 'result' && profile && results && (
        <section className="results">
          <div className="card pillar-hero">
            <div className="pillar-eyebrow">나의 일주 · Day Pillar</div>
            <div className="pillar-hanja serif" style={{ color: ganColorVar }}>{profile.hanjaLabel}</div>
            <div className="pillar-name">
              {profile.label}일주<span className="hanja-sm">{profile.gan.hanja}{profile.zhi.hanja}</span>
            </div>
            <p className="pillar-tagline">{profile.traitPhrase} 사람</p>
            <p className="pillar-info-line">
              일간 {profile.gan.gan}({profile.gan.hanja}) · 일지 {profile.zhi.zhi}({profile.zhi.hanja}, {profile.zhi.animal}띠)
            </p>
            <div className="badge-row">
              <span className="badge" style={{ background: ganColorVar }}>
                <span className="badge-dot" />{profile.gan.element} · {profile.gan.yinyang}
              </span>
              <span className="badge" style={{ background: 'var(--accent-2)' }}>
                <span className="badge-dot" />{profile.coreImage}
              </span>
            </div>
          </div>

          <div className="card character-card">
            <div className="character-head">
              <TenganIcon gan={profile.gan.gan} />
              <span className="character-title">일주 성향</span>
            </div>
            <p className="profile-desc">{profile.character}</p>
            <div className="profile-chart">
              <RadarChart axes={profile.axes5} />
            </div>
          </div>

          <h2 className="group-title">오늘의 추천</h2>
          <div className="rec-stack">
            {results.b.top3.map((item) => (
              <LiquorCard
                key={item.liquor.id}
                item={item}
                explanation={buildGanExplanation(item.liquor, profile)}
                accentClass="accent-a"
                label="☯ 당신의 일주를 닮은 한 잔"
              />
            ))}
            {results.c.top3.map((item) => (
              <LiquorCard
                key={item.liquor.id}
                item={item}
                explanation={buildTasteExplanation(item.liquor, situ.S1)}
                accentClass="accent-c"
                label="🍶 내 입맛이 고른 한 잔"
              />
            ))}
          </div>

          <p className="disclaimer">
            일주(일간·일지) 성향은 명리학적 상징을 앱 추천용으로 구조화한 값이며 과학적 성격 검사가 아닙니다. 재미로 즐겨주세요.
          </p>

          <div className="result-actions">
            <button className="btn-primary" onClick={handleShare}>결과 공유하기</button>
            <button className="btn-secondary" onClick={() => setStep('intro')}>처음부터 다시</button>
          </div>
          {shareStatus === 'copied' && <p className="share-toast">결과가 클립보드에 복사됐어요. 원하는 곳에 붙여넣어 보세요!</p>}
          {shareStatus === 'error' && <p className="share-toast share-toast-error">공유에 실패했어요. 다시 시도해주세요.</p>}
        </section>
      )}
    </div>
  );
}
