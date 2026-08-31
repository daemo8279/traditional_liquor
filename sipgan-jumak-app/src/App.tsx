import { useMemo, useState } from 'react';
import liquorsData from './data/liquors.json';
import tenganData from './data/tengan.json';
import type { Liquor, TenganProfile, TasteAnswers, SituAnswers, SituLabel, BanjuLabel } from './lib/types';
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

function LiquorCard({ item, accentClass }: { item: ScoredLiquor; accentClass: string }) {
  const l = item.liquor;
  return (
    <div className={`liquor-card ${accentClass}`}>
      <div className="liquor-card-head">
        <span className="liquor-cat">{l.category}</span>
        <span className="liquor-score">{item.score.toFixed(1)}점</span>
      </div>
      <div className="liquor-name">{l.name}</div>
      <div className="liquor-meta">{l.maker} · {l.subtype} · {l.abv}%</div>
      {l.tasteNote && <div className="liquor-note">"{l.tasteNote}"</div>}
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
    const b = recommend(weightB, liquors, stats, situ.S2, today);
    const c = recommend(weightC, liquors, stats, situ.S2, today);
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
        <h1>십간주막</h1>
        <p className="sub">생년월일의 일간, 오늘의 취향, 오늘의 상황 — 매일 다른 전통주 한 병을 권해드립니다.</p>
      </header>

      {step === 'birth' && (
        <section className="card step-card">
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
          <h2 className="group-title">그룹 ① · 나의 특성</h2>
          <div className="card profile-card">
            <div className="profile-head">
              <span className="profile-gan">{profile.gan}</span>
              <span className="profile-hanja">{profile.hanja}</span>
              <span className="profile-elem">{profile.element} · {profile.yinyang}</span>
            </div>
            <div className="profile-image">{profile.coreImage}</div>
            <p className="profile-desc">{profile.character}</p>
            <div className="axis-bars">
              {(['확장성', '강렬성', '안정성', '정제감', '유연성'] as const).map((ax) => (
                <div className="axis-row" key={ax}>
                  <span className="axis-label">{ax}</span>
                  <div className="axis-track">
                    <div className="axis-fill" style={{ width: `${(profile.axes5[ax] / 5) * 100}%` }} />
                  </div>
                  <span className="axis-val">{profile.axes5[ax].toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>

          <h2 className="group-title">그룹 ② · 오늘의 추천</h2>
          <div className="two-col">
            <div>
              <div className="block-title accent-a">B · 십천간이 추천하는 오늘의 전통주</div>
              {results.b.top3.map((item) => (
                <LiquorCard key={item.liquor.id} item={item} accentClass="accent-a" />
              ))}
            </div>
            <div>
              <div className="block-title accent-c">C · 취향·상황에 맞는 오늘의 전통주</div>
              {results.c.top3.map((item) => (
                <LiquorCard key={item.liquor.id} item={item} accentClass="accent-c" />
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
