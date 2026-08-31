import { useMemo, useState } from 'react';
import liquorsData from './data/liquors.json';
import tenganData from './data/tengan.json';
import type { Liquor, TenganProfile, TasteAnswers, SituAnswers, SituLabel, BanjuLabel, DerivedAxis } from './lib/types';
import { calcDayGan } from './lib/tengan';
import {
  computeStats, tasteWeights, situationWeights, tenganWeights,
  buildWeightB, buildWeightC, recommend, type ScoredLiquor,
} from './lib/algorithm';
import './App.css';

const liquors = liquorsData as unknown as Liquor[];
const tenganList = tenganData as unknown as TenganProfile[];
const stats = computeStats(liquors);

type Step = 'birth' | 'taste' | 'situ' | 'result';

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

function LanternIcon() {
  return (
    <svg width="72" height="98" viewBox="0 0 72 98" className="lantern-icon" aria-hidden="true">
      <line x1="36" y1="0" x2="36" y2="14" className="lantern-string" />
      <circle cx="36" cy="41" r="27" className="lantern-glow" />
      <path d="M20 20 Q36 8 52 20 L48 63 Q36 73 24 63 Z" className="lantern-body" />
      <line x1="20" y1="20" x2="52" y2="20" className="lantern-rim" />
      <line x1="24" y1="63" x2="48" y2="63" className="lantern-rim" />
      <ellipse cx="36" cy="42" rx="6.5" ry="10" className="lantern-flame" />
      <line x1="36" y1="73" x2="36" y2="90" className="lantern-string" />
      <circle cx="36" cy="92" r="2.5" className="lantern-tassel" />
    </svg>
  );
}

const SITU_OPTIONS: SituLabel[] = ['혼술', '식사', '데이트', '모임·파티', '특별한 날·선물'];
const BANJU_OPTIONS: BanjuLabel[] = ['전·튀김', '육류·구이', '해산물·회', '치즈·디저트·과일', '나물·두부·매콤한 안주', '없음'];

const TASTE_LABELS: Record<keyof TasteAnswers, { q: string; opts: string[] }> = {
  T1: { q: '오늘 술의 단맛, 어느 정도가 좋으세요?', opts: ['완전 드라이', '은은한 단맛', '중간', '단맛 좋아함', '매우 달콤하게'] },
  T2: { q: '가볍고 산뜻한 쪽 vs 묵직하고 진한 쪽?', opts: ['아주 가볍게', '산뜻하게', '중간', '진하게', '아주 묵직하게'] },
  T3: { q: '고소한 곡물·누룩향 vs 과일·꽃향, 뭐가 더 끌리세요?', opts: ['곡물·누룩 쪽', '약간 곡물', '둘 다 좋음', '약간 과일', '과일·꽃 쪽'] },
  T4: { q: '알콜의 쌉싸래한 향은 얼마나 즐기시나요?', opts: ['거의 안 느껴지게', '은은하게', '중간', '분명하게', '강렬하게'] },
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function liquorSummary(l: Liquor): string {
  return `${l.name}은 ${l.category}·${l.subtype}로, ${l.tasteNote} 등이 특징인 술입니다.`;
}

function buildTasteExplanation(l: Liquor, situ: SituLabel): string {
  return `${liquorSummary(l)} 그래서 이 술은 ${situ} 같은 오늘의 상황과 당신의 취향에 적합한 술이에요.`;
}

function buildGanExplanation(l: Liquor, profile: TenganProfile): string {
  return `${liquorSummary(l)} ${profile.traitPhrase} 성향인 당신에게 어울리는 한 잔입니다.`;
}

function LiquorCard({ item, explanation, accentClass }: { item: ScoredLiquor; explanation: string; accentClass: string }) {
  const l = item.liquor;
  return (
    <div className={`liquor-card ${accentClass}`}>
      <div className="liquor-card-head">
        <span className="liquor-cat">{l.category}</span>
        <span className="liquor-score">{item.score.toFixed(1)}점</span>
      </div>
      <div className="liquor-name">{l.name}</div>
      <div className="liquor-meta">{l.maker} · {l.subtype} · {l.abv}%</div>
      <p className="liquor-explain">{explanation}</p>
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState<Step>('birth');
  const [birth, setBirth] = useState('');
  const [birthError, setBirthError] = useState('');
  const [taste, setTaste] = useState<TasteAnswers>({ T1: 3, T2: 3, T3: 3, T4: 3 });
  const [situ, setSitu] = useState<SituAnswers>({ S1: '혼술', S2: [], S3: '보통', S4: 3 });

  const ganName = useMemo(() => {
    if (!birth) return null;
    try {
      return calcDayGan(birth);
    } catch {
      return null;
    }
  }, [birth]);

  const profile = useMemo(
    () => tenganList.find((t) => t.gan === ganName) ?? null,
    [ganName],
  );

  const results = useMemo(() => {
    if (!profile) return null;
    const tw = tasteWeights(taste, situ.S3);
    const sw = situationWeights(situ);
    const gw = tenganWeights(profile);
    const weightB = buildWeightB(tw, sw, gw);
    const weightC = buildWeightC(tw, sw);
    const today = todayStr();
    const b = recommend(weightB, liquors, stats, situ.S2, today, 1);
    const c = recommend(weightC, liquors, stats, situ.S2, today, 1);
    return { b, c };
  }, [profile, taste, situ]);

  function submitBirth() {
    if (!birth) { setBirthError('생년월일을 입력해주세요.'); return; }
    try {
      calcDayGan(birth);
      setBirthError('');
      setStep('taste');
    } catch (e) {
      setBirthError('날짜를 다시 확인해주세요.');
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

  return (
    <div className="shell">
      <header className="masthead">
        <div className="kicker">酒 TRADITIONAL LIQUOR × SAJU</div>
        <h1>십천간주막</h1>
        <p className="sub">생년월일의 일간, 오늘의 취향, 오늘의 상황 — 매일 다른 전통주 한 병을 권해드립니다.</p>
      </header>

      {step === 'birth' && (
        <section className="card step-card">
          <LanternIcon />
          <h2>01 · 생년월일</h2>
          <p className="hint">양력 날짜만 입력해주세요 (시간은 필요 없습니다).</p>
          <p className="hint">음력 생일이시면 만세력 앱에 음력으로 입력해 변환된 양력 날짜를 확인한 후 입력해주세요.</p>
          <input
            type="date"
            value={birth}
            onChange={(e) => setBirth(e.target.value)}
            className="date-input"
          />
          {birthError && <p className="error">{birthError}</p>}
          <p className="privacy-note">입력한 개인정보는 저장되지 않아요.</p>
          <button className="btn-primary" onClick={submitBirth}>다음</button>
        </section>
      )}

      {step === 'taste' && (
        <section className="card step-card">
          <h2>02 · 취향 (1/2)</h2>
          {(Object.keys(TASTE_LABELS) as (keyof TasteAnswers)[]).map((key) => (
            <div className="qblock" key={key}>
              <div className="qtext">{TASTE_LABELS[key].q}</div>
              <div className="opt-row">
                {TASTE_LABELS[key].opts.map((label, i) => (
                  <button
                    key={label}
                    className={`opt-btn ${taste[key] === i + 1 ? 'active' : ''}`}
                    onClick={() => setTaste((t) => ({ ...t, [key]: i + 1 }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="nav-row">
            <button className="btn-secondary" onClick={() => setStep('birth')}>이전</button>
            <button className="btn-primary" onClick={() => setStep('situ')}>다음</button>
          </div>
        </section>
      )}

      {step === 'situ' && (
        <section className="card step-card">
          <h2>03 · 상황 (2/2)</h2>

          <div className="qblock">
            <div className="qtext">오늘은 어떤 자리인가요? (단일 선택)</div>
            <div className="opt-row">
              {SITU_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`opt-btn ${situ.S1 === opt ? 'active' : ''}`}
                  onClick={() => setSitu((s) => ({ ...s, S1: opt }))}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="qblock">
            <div className="qtext">함께 먹을 안주가 있다면? (복수 선택)</div>
            <div className="opt-row">
              {BANJU_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`opt-btn ${situ.S2.includes(opt) ? 'active' : ''}`}
                  onClick={() => toggleBanju(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="qblock">
            <div className="qtext">가볍게 한 잔 vs 오늘만큼은 진하게?</div>
            <div className="opt-row">
              {(['가볍게', '보통', '진하게'] as const).map((opt) => (
                <button
                  key={opt}
                  className={`opt-btn ${situ.S3 === opt ? 'active' : ''}`}
                  onClick={() => setSitu((s) => ({ ...s, S3: opt }))}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="qblock">
            <div className="qtext">오늘은 익숙한 술이 좋으세요, 새로운 술에 도전해보고 싶으세요?</div>
            <div className="opt-row">
              {['아주 익숙한 것', '무난한 것', '중간', '개성 있는 것', '완전 새로운 것'].map((label, i) => (
                <button
                  key={label}
                  className={`opt-btn ${situ.S4 === i + 1 ? 'active' : ''}`}
                  onClick={() => setSitu((s) => ({ ...s, S4: i + 1 }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="nav-row">
            <button className="btn-secondary" onClick={() => setStep('taste')}>이전</button>
            <button className="btn-primary" onClick={() => setStep('result')}>결과 보기</button>
          </div>
        </section>
      )}

      {step === 'result' && profile && results && (
        <section className="results">
          <h2 className="group-title">나의 특성</h2>
          <div className="card profile-card">
            <div className="profile-grid">
              <div className="profile-text">
                <TenganIcon gan={profile.gan} />
                <div className="profile-head">
                  <span className="profile-gan">{profile.gan}</span>
                  <span className="profile-hanja">{profile.hanja}</span>
                  <span className="profile-elem">{profile.element} · {profile.yinyang}</span>
                </div>
                <div className="profile-image">{profile.coreImage}</div>
                <p className="profile-desc">{profile.character}</p>
              </div>
              <div className="profile-chart">
                <RadarChart axes={profile.axes5} />
              </div>
            </div>
          </div>

          <div className="two-col">
            <div>
              <div className="block-title accent-a">십천간이 추천하는 오늘의 전통주</div>
              {results.b.top3.map((item) => (
                <LiquorCard
                  key={item.liquor.id}
                  item={item}
                  explanation={buildGanExplanation(item.liquor, profile)}
                  accentClass="accent-a"
                />
              ))}
            </div>
            <div>
              <div className="block-title accent-c">취향·상황에 맞는 오늘의 전통주</div>
              {results.c.top3.map((item) => (
                <LiquorCard
                  key={item.liquor.id}
                  item={item}
                  explanation={buildTasteExplanation(item.liquor, situ.S1)}
                  accentClass="accent-c"
                />
              ))}
            </div>
          </div>

          <p className="disclaimer">
            십천간 성향은 명리학적 상징을 앱 추천용으로 구조화한 값이며 과학적 성격 검사가 아닙니다. 재미로 즐겨주세요.
          </p>

          <button className="btn-secondary" onClick={() => setStep('birth')}>처음부터 다시</button>
        </section>
      )}
    </div>
  );
}
