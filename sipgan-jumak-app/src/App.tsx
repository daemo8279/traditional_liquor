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

// ---- 술창고 태그 검색용: DB의 로우 태그 필드(향/맛/안주/상황/재료)를 전부 모아
// 술 하나당 태그 배열로, 그리고 전체 태그 빈도 목록으로 미리 계산해 둔다. ----
const TAG_FIELDS: (keyof Liquor)[] = ['aromaTag', 'tasteNote', 'banjuTag', 'situTag', 'mainIngredient'];
function splitTags(v: unknown): string[] {
  return typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}
const LIQUOR_TAGS: Record<string, string[]> = {};
const TAG_COUNT = new Map<string, number>();
for (const l of liquors) {
  const tagSet = new Set<string>();
  for (const f of TAG_FIELDS) for (const t of splitTags(l[f])) tagSet.add(t);
  const tags = [...tagSet];
  LIQUOR_TAGS[l.id] = tags;
  for (const t of tags) TAG_COUNT.set(t, (TAG_COUNT.get(t) ?? 0) + 1);
}
const ALL_TAGS: string[] = [...TAG_COUNT.keys()].sort((a, b) => a.localeCompare(b, 'ko'));
const POPULAR_TAGS: string[] = [...TAG_COUNT.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 24)
  .map(([t]) => t);

type Step = 'intro' | 'birth' | 'T1' | 'T2' | 'T3' | 'T4' | 'S1' | 'S2' | 'S3' | 'S4' | 'result' | 'catalog';
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
  selected: T | undefined;
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

function IntroScreen({ onStart, onCatalog }: { onStart: () => void; onCatalog: () => void }) {
  return (
    <section className="intro-screen">
      <MoonJarIcon />
      <h1 className="intro-title">십천간주막</h1>
      <p className="intro-desc">
        태어난 날의 일주(日柱)와 오늘의 취향·상황을 더해, 매일 다른 전통주 한 병을 권해드립니다.
      </p>
      <button className="intro-cta" onClick={onStart}>내 술 찾으러 가기</button>
      <p className="intro-footnote">입력한 생년월일 정보는 저장하지 않아요.</p>
      <button className="catalog-link" onClick={onCatalog}>📚 술창고 보러 가기</button>
    </section>
  );
}

const CATEGORY_OPTIONS = ['탁주', '약주·청주', '증류주', '과실주', '기타주류'];

function CatalogCard({ l }: { l: Liquor }) {
  const chips = [
    `${l.abv}%`,
    l.subtype,
    ...(l.tasteNote ? l.tasteNote.split(/[,·、]/).map((s) => s.trim()).filter(Boolean).slice(0, 2) : []),
  ];
  return (
    <div className="catalog-card">
      <div className="catalog-card-head">
        <span className="catalog-card-cat">{l.category}</span>
        <span className="catalog-card-region">{l.region}</span>
      </div>
      <div className="liquor-name">{l.name}</div>
      <div className="liquor-meta">{l.maker}</div>
      <div className="chip-row">
        {chips.map((c, i) => (
          <span key={i} className="chip">{c}</span>
        ))}
      </div>
      <div className="liquor-links">
        {l.buyUrl && (
          <a href={l.buyUrl} target="_blank" rel="noopener noreferrer" className="liquor-link liquor-link-buy">
            사러 가기
          </a>
        )}
        {l.refUrl && (
          <a href={l.refUrl} target="_blank" rel="noopener noreferrer" className="liquor-link liquor-link-info">
            정보 보기
          </a>
        )}
      </div>
    </div>
  );
}

function FilterGroup<T extends string>({
  title, options, active, onToggle,
}: { title: string; options: T[]; active: T[]; onToggle: (v: T) => void }) {
  return (
    <div className="filter-group">
      <div className="filter-title">{title}</div>
      <div className="filter-chip-row">
        {options.map((opt) => (
          <button
            key={opt}
            className={`filter-chip ${active.includes(opt) ? 'active' : ''}`}
            onClick={() => onToggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagSearch({
  activeTags, onAdd, onRemove,
}: { activeTags: string[]; onAdd: (t: string) => void; onRemove: (t: string) => void }) {
  const [tagQuery, setTagQuery] = useState('');
  const suggestions = useMemo(() => {
    const q = tagQuery.trim();
    if (!q) return [];
    return ALL_TAGS.filter((t) => t.includes(q) && !activeTags.includes(t)).slice(0, 10);
  }, [tagQuery, activeTags]);

  return (
    <div className="filter-group">
      <div className="filter-title">태그로 찾기 ({ALL_TAGS.length}개 태그 · 향·맛·안주·상황·재료 데이터 기반)</div>
      <input
        type="text"
        placeholder="예: 복분자, 치즈, 데이트, 산미..."
        value={tagQuery}
        onChange={(e) => setTagQuery(e.target.value)}
        className="date-input catalog-search"
      />
      {activeTags.length > 0 && (
        <div className="filter-chip-row active-tag-row">
          {activeTags.map((t) => (
            <button key={t} className="filter-chip active" onClick={() => onRemove(t)}>
              {t} ✕
            </button>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="filter-chip-row">
          {suggestions.map((t) => (
            <button
              key={t}
              className="filter-chip"
              onClick={() => { onAdd(t); setTagQuery(''); }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {!tagQuery && (
        <>
          <div className="filter-subtitle">인기 태그</div>
          <div className="filter-chip-row">
            {POPULAR_TAGS.filter((t) => !activeTags.includes(t)).map((t) => (
              <button key={t} className="filter-chip" onClick={() => onAdd(t)}>
                {t}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CatalogScreen({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'search' | 'all'>('search');
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);

  function toggle<T>(list: T[], setList: (v: T[]) => void, v: T) {
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }
  function addTag(t: string) {
    setActiveTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
  }
  function removeTag(t: string) {
    setActiveTags((prev) => prev.filter((x) => x !== t));
  }

  const filtered = useMemo(() => {
    const q = query.trim();
    return liquors.filter((l) => {
      if (q && !l.name.includes(q) && !l.maker.includes(q)) return false;
      if (cats.length && !cats.includes(l.category)) return false;
      if (activeTags.length) {
        const tags = LIQUOR_TAGS[l.id] ?? [];
        if (!activeTags.every((t) => tags.includes(t))) return false;
      }
      return true;
    });
  }, [query, cats, activeTags]);

  const grouped = useMemo(() => {
    const map = new Map<string, Liquor[]>();
    for (const cat of CATEGORY_OPTIONS) map.set(cat, []);
    for (const l of liquors) {
      if (!map.has(l.category)) map.set(l.category, []);
      map.get(l.category)!.push(l);
    }
    return [...map.entries()].filter(([, list]) => list.length > 0);
  }, []);

  return (
    <section className="catalog-screen">
      <div className="catalog-header">
        <h2>술창고</h2>
        <p className="hint">지금 십천간주막이 알고 있는 전통주 {liquors.length}종을 자유롭게 둘러보세요.</p>
      </div>

      <div className="mode-tabs">
        <button className={`mode-tab ${mode === 'search' ? 'active' : ''}`} onClick={() => setMode('search')}>
          술 찾기
        </button>
        <button className={`mode-tab ${mode === 'all' ? 'active' : ''}`} onClick={() => setMode('all')}>
          전체 술 보기
        </button>
      </div>

      {mode === 'search' && (
        <>
          <input
            type="text"
            placeholder="술 이름이나 양조장으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="date-input catalog-search"
          />

          <FilterGroup title="종류" options={CATEGORY_OPTIONS} active={cats} onToggle={(v) => toggle(cats, setCats, v)} />
          <TagSearch activeTags={activeTags} onAdd={addTag} onRemove={removeTag} />

          <p className="catalog-count">{filtered.length}종의 술을 찾았어요.</p>

          <div className="catalog-grid">
            {filtered.map((l) => (
              <CatalogCard key={l.id} l={l} />
            ))}
            {filtered.length === 0 && <p className="hint">조건에 맞는 술이 없어요. 검색어나 태그를 조정해보세요.</p>}
          </div>
        </>
      )}

      {mode === 'all' && (
        <>
          <p className="catalog-count">전체 {liquors.length}종을 종류별로 모아봤어요.</p>
          {grouped.map(([cat, list]) => (
            <div key={cat} className="catalog-cat-block">
              <h3 className="catalog-cat-title">{cat} <span className="catalog-cat-count">{list.length}종</span></h3>
              <div className="catalog-grid">
                {list.map((l) => (
                  <CatalogCard key={l.id} l={l} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <div className="result-actions">
        <button className="btn-secondary" onClick={onBack}>처음으로 돌아가기</button>
      </div>
    </section>
  );
}

export default function App() {
  const [step, setStep] = useState<Step>('intro');
  const [birth, setBirth] = useState('');
  const [birthError, setBirthError] = useState('');
  // 질문 화면에 처음 진입했을 때 특정 답이 미리 체크되어 보이지 않도록, 답하기 전에는
  // undefined로 두고(어떤 버튼도 active가 아님) 사용자가 실제로 고른 값만 채운다.
  const [taste, setTaste] = useState<Partial<TasteAnswers>>({});
  const [situ, setSitu] = useState<Partial<SituAnswers> & { S2: BanjuLabel[] }>({ S2: [] });
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

  // 결과 화면은 8개 질문에 모두 답한 뒤에만 도달하므로, 여기서는 안전하게 기본값(중간)으로
  // 채워 필수 필드를 만족시킨다(질문 화면 자체에서는 이 기본값이 보이지 않는다).
  const effTaste: TasteAnswers = {
    T1: taste.T1 ?? 3, T2: taste.T2 ?? 3, T3: taste.T3 ?? 3, T4: taste.T4 ?? 3,
  };
  const effSitu: SituAnswers = {
    S1: situ.S1 ?? '혼술', S2: situ.S2, S3: situ.S3 ?? '보통', S4: situ.S4 ?? 3,
  };

  const results = useMemo(() => {
    if (!profile) return null;
    const tw = tasteWeights(effTaste, effSitu.S3);
    const sw = situationWeights(effSitu);
    const gw = tenganWeights(profile.weightAxes5);
    const weightB = buildWeightB(tw, sw, gw);
    const weightC = buildWeightC(tw, sw);
    const today = todayStr();
    const b = recommend(weightB, liquors, stats, effSitu.S2, today, 1);
    const c = recommend(weightC, liquors, stats, effSitu.S2, today, 1);
    return { b, c };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    try {
      if (navigator.share) {
        // url을 따로 넘기면 카카오톡 등 일부 공유 대상이 링크 미리보기 카드만 만들고
        // text(일주·추천 술 내용)는 아예 숨겨버려서 "링크만 공유됨"처럼 보인다.
        // 링크는 이미 text 안에 포함되어 있으므로, url 필드 없이 text만 공유한다.
        await navigator.share({ title: '십천간주막 — 오늘의 결과', text });
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

      {step === 'intro' && <IntroScreen onStart={goNext} onCatalog={() => setStep('catalog')} />}

      {step === 'catalog' && <CatalogScreen onBack={() => setStep('intro')} />}

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
                explanation={buildTasteExplanation(item.liquor, effSitu.S1)}
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
