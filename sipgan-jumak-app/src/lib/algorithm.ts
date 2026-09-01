// 05. 추천 알고리즘 (v0.7 — 통합 축 가중치 방식, z-score 정규화, 청량감 포함 S1 롤백)
import type { Axis, DerivedAxis, Liquor, TasteAnswers, SituAnswers, SituLabel } from './types';

export const RAW_AXES: Axis[] = ['단맛', '산미', '향강도', '바디', '알코올감', '청량감', '곡물감', '과실감', '전통성', '모험도'];
export const DERIVED_AXES: DerivedAxis[] = ['확장성', '강렬성', '안정성', '정제감', '유연성'];
export const ALL_AXES: Axis[] = [...RAW_AXES, ...DERIVED_AXES];

type Weights = Partial<Record<Axis, number>>;

// ---- S1 옵션별 축 가중치 (v0.7 = v0.4 롤백, 청량감 포함) ----
export const SITU_WEIGHTS: Record<SituLabel, Weights> = {
  '혼술': { 청량감: 2 },
  '식사': { 안정성: 1.5, 곡물감: 1.5 },
  '데이트': { 유연성: 1.5, 향강도: 1.5 },
  '모임·파티': { 확장성: 1.5, 청량감: 1.5 },
  '특별한 날·선물': { 정제감: 2, 향강도: 1, 강렬성: 1 },
};

// ---- 축별 평균/표준편차 (z-score 정규화용, 120종 풀 기준) ----
export interface AxisStats { mean: number; std: number }
export function computeStats(liquors: Liquor[]): Record<Axis, AxisStats> {
  const stats = {} as Record<Axis, AxisStats>;
  for (const ax of ALL_AXES) {
    const vals = liquors.map((l) => l.axes[ax]).filter((v) => typeof v === 'number');
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const std = Math.sqrt(variance) || 1;
    stats[ax] = { mean, std };
  }
  return stats;
}

function zscore(liquor: Liquor, axis: Axis, stats: Record<Axis, AxisStats>): number {
  const { mean, std } = stats[axis];
  const v = liquor.axes[axis];
  return (v - mean) / std;
}

function l1(w: Weights): number {
  return Object.values(w).reduce((a, b) => a + Math.abs(b ?? 0), 0);
}

function merge(...ws: Weights[]): Weights {
  const out: Weights = {};
  for (const w of ws) {
    for (const [k, v] of Object.entries(w)) {
      const ax = k as Axis;
      out[ax] = (out[ax] ?? 0) + (v ?? 0);
    }
  }
  return out;
}

// ---- 취향(T1~T4) 가중치, S3 무드 보정 포함 ----
export function tasteWeights(t: TasteAnswers, mood: SituAnswers['S3']): Weights {
  const moodOffset = mood === '가볍게' ? -1 : mood === '진하게' ? 1 : 0;
  const T2p = Math.min(5, Math.max(1, t.T2 + moodOffset));
  const T4p = Math.min(5, Math.max(1, t.T4 + moodOffset));
  return {
    단맛: t.T1 - 3,
    바디: T2p - 3,
    곡물감: 3 - t.T3, // T3=1(곡물 쪽) -> +2
    과실감: t.T3 - 3, // T3=5(과일 쪽) -> +2, 곡물감과 자동 반대 부호
    알코올감: T4p - 3,
  };
}

// ---- 상황(S1,S4) 가중치 ----
export function situationWeights(s: SituAnswers): Weights {
  const base = { ...SITU_WEIGHTS[s.S1] };
  return merge(base, { 모험도: s.S4 - 3 });
}

// ---- 일주(사주) 가중치 (= axes5값 - 3) ----
// v0.8: 일간(10종) 프로필뿐 아니라, 일간+일지를 합성한 60갑자 일주 프로필의 axes5도 그대로 받는다.
export function tenganWeights(axes5: Record<DerivedAxis, number>): Weights {
  const w: Weights = {};
  for (const ax of DERIVED_AXES) w[ax] = axes5[ax] - 3;
  return w;
}

// ---- 정합도(alignment) 계산 ----
function alignment(weights: Weights, liquor: Liquor, stats: Record<Axis, AxisStats>): number | null {
  let num = 0;
  let den = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (!w) continue;
    num += w * zscore(liquor, k as Axis, stats);
    den += Math.abs(w);
  }
  if (den === 0) return null;
  return num / den;
}

function minmax100(scores: Map<string, number>): Map<string, number> {
  const vals = [...scores.values()];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const out = new Map<string, number>();
  if (hi - lo < 1e-9) {
    for (const k of scores.keys()) out.set(k, 50);
    return out;
  }
  for (const [k, v] of scores) out.set(k, ((v - lo) / (hi - lo)) * 100);
  return out;
}

// ---- 안주 카테고리 매칭 가산점 (0~30) ----
function banjuBonus(liquor: Liquor, s2: SituAnswers['S2']): number {
  if (!s2 || s2.length === 0 || s2.includes('없음')) return 0;
  const matched = s2.filter((opt) => liquor.banjuCategory.includes(opt)).length;
  return Math.min(30, matched * 10);
}

// ---- 구매접근성 보정 ----
// v0.8: 기존 A:+10/C:-5는 minmax_100 스케일(0~100) 위에서 너무 큰 비중을 차지해,
// 취향·사주 궁합과 무관하게 접근성 A등급 술(120종 중 22종) 몇 개가 거의 항상 1위를 차지하는
// 편중 문제가 있었다. 취향/사주 정합도가 실제로 순위를 갈라놓도록 보정폭을 줄였다.
function accessBonus(liquor: Liquor): number {
  if (liquor.accessibility === 'A') return 3;
  if (liquor.accessibility === 'C') return -2;
  return 0;
}

export interface ScoredLiquor {
  liquor: Liquor;
  score: number;
}

/**
 * weight 벡터로 120종 후보를 스코어링합니다.
 * final_score = minmax_100(alignment) + 안주 가산점(0~30) + 구매접근성 보정(A:+3/C:-2), clip 0~100
 */
export function scoreAll(
  weights: Weights,
  liquors: Liquor[],
  stats: Record<Axis, AxisStats>,
  s2: SituAnswers['S2'],
): ScoredLiquor[] {
  const raw = new Map<string, number>();
  for (const l of liquors) {
    const a = alignment(weights, l, stats);
    raw.set(l.id, a ?? 0); // Σ|weight|=0이면 전체 후보 동점(0) 처리 -> minmax에서 전부 50점
  }
  const normalized = minmax100(raw);
  return liquors.map((l) => {
    const base = normalized.get(l.id) ?? 50;
    const score = Math.min(100, Math.max(0, base + banjuBonus(l, s2) + accessBonus(l)));
    return { liquor: l, score };
  });
}

// ---- B(십천간 가중 추천) weight 조합: scale = 0.5 × Σ|취향+상황| / Σ|십천간_raw| (사주 목표 비중 약 33%) ----
export function buildWeightB(taste: Weights, situ: Weights, tengan: Weights): Weights {
  const other = merge(taste, situ);
  const otherMag = l1(other);
  const ganMag = l1(tengan);
  const scale = ganMag > 0 ? (0.5 * otherMag) / ganMag : 0;
  const scaledTengan: Weights = {};
  for (const [k, v] of Object.entries(tengan)) scaledTengan[k as Axis] = (v ?? 0) * scale;
  return merge(other, scaledTengan);
}

export function buildWeightC(taste: Weights, situ: Weights): Weights {
  return merge(taste, situ);
}

// ---- diversify: 대분류 다양성 보정 (soft, top3) ----
export function diversify(sorted: ScoredLiquor[], topN = 3): ScoredLiquor[] {
  const result: ScoredLiquor[] = [];
  const catCount: Record<string, number> = {};
  const pool = [...sorted];
  let i = 0;
  while (result.length < topN && i < pool.length) {
    const cand = pool[i];
    const cat = cand.liquor.category;
    if ((catCount[cat] ?? 0) >= 2) {
      // 같은 대분류가 이미 2개 -> 다른 대분류의 다음 후보와 점수 차 5점 이내일 때만 교체
      const altIdx = pool.findIndex(
        (p, idx) => idx > i && p.liquor.category !== cat && cand.score - p.score <= 5,
      );
      if (altIdx !== -1) {
        const alt = pool[altIdx];
        result.push(alt);
        catCount[alt.liquor.category] = (catCount[alt.liquor.category] ?? 0) + 1;
        pool.splice(altIdx, 1);
        i++;
        continue;
      }
    }
    result.push(cand);
    catCount[cat] = (catCount[cat] ?? 0) + 1;
    i++;
  }
  return result;
}

// ---- 동률 방지: 인접 순위 간격 1.5점 미만을 동률 그룹으로 묶고 결정적 로테이션 ----
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function tieBreakSort(scored: ScoredLiquor[], todayStr: string): ScoredLiquor[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const groups: ScoredLiquor[][] = [];
  let cur: ScoredLiquor[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      cur = [sorted[i]];
      continue;
    }
    if (cur[cur.length - 1].score - sorted[i].score < 1.5) {
      cur.push(sorted[i]);
    } else {
      groups.push(cur);
      cur = [sorted[i]];
    }
  }
  if (cur.length) groups.push(cur);

  const out: ScoredLiquor[] = [];
  for (const g of groups) {
    if (g.length === 1) {
      out.push(g[0]);
      continue;
    }
    const relOrder: Record<string, number> = { '높음': 0, '보통': 1, '낮음': 2 };
    const accOrder: Record<string, number> = { A: 0, B: 1, C: 2 };
    const rotated = g
      .map((s) => ({ s, hash: hashStr(s.liquor.id + todayStr) }))
      .sort((a, b) => {
        const rel = (relOrder[a.s.liquor.reliability] ?? 1) - (relOrder[b.s.liquor.reliability] ?? 1);
        if (rel !== 0) return rel;
        const acc = (accOrder[a.s.liquor.accessibility] ?? 1) - (accOrder[b.s.liquor.accessibility] ?? 1);
        if (acc !== 0) return acc;
        return (a.hash % g.length) - (b.hash % g.length);
      })
      .map((x) => x.s);
    out.push(...rotated);
  }
  return out;
}

export interface RecommendResult {
  top3: ScoredLiquor[];
}

export function recommend(
  weights: Weights,
  liquors: Liquor[],
  stats: Record<Axis, AxisStats>,
  s2: SituAnswers['S2'],
  todayStr: string,
  topN = 3,
): RecommendResult {
  const scored = scoreAll(weights, liquors, stats, s2)
    .filter((s) => s.liquor.reliability !== '낮음');
  const tieBroken = tieBreakSort(scored, todayStr);
  // diversify는 3개 기준 대분류 다양성 보정 로직이므로, 후보 풀 자체는 항상 3개 기준으로 계산한 뒤 필요한 개수만 반환한다.
  const top3 = diversify(tieBroken, 3);
  return { top3: top3.slice(0, topN) };
}
