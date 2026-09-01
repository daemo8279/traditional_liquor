// 04. 일주(日柱) 조합 — 일간(10) × 일지(12) = 60갑자 조합으로 확장
// 같은 일간이라도 일지에 따라 성격/추천이 달라지도록, 일간 프로필에 일지 보정치를 얹어
// 60가지 조합을 절차적으로 생성한다. (일지 12개를 손으로 60개 다 새로 쓰는 대신
// 축(성실/축소)·오(강렬/즉흥) 같은 일지 고유 특성을 일간 위에 얹는 방식)
import type { TenganProfile, ZhiProfile, GanZhiProfile, DerivedAxis } from './types';

const DERIVED_AXES: DerivedAxis[] = ['확장성', '강렬성', '안정성', '정제감', '유연성'];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function combineGanZhi(gan: TenganProfile, zhi: ZhiProfile): GanZhiProfile {
  // 표시용(레이더 차트)은 1~5로 clamp하지만, clamp를 하면 이미 5(또는 1)에 붙어있는 축은
  // 서로 다른 일지라도 값이 같아져 버려(예: 병화의 확장성·강렬성은 이미 5) 추천이 구분되지 않는다.
  // 그래서 알고리즘에 넘기는 weightAxes5는 clamp 없이 그대로 둬서 60갑자가 실제로 다 다르게 반영되게 한다.
  const axes5 = {} as Record<DerivedAxis, number>;
  const weightAxes5 = {} as Record<DerivedAxis, number>;
  for (const ax of DERIVED_AXES) {
    const base = gan.axes5[ax];
    const offset = zhi.axesOffset[ax] ?? 0;
    weightAxes5[ax] = base + offset;
    axes5[ax] = clamp(base + offset, 1, 5);
  }

  const character =
    `${gan.character} 여기에 일지 ${zhi.zhi}(${zhi.hanja}, ${zhi.animal})의 기운이 더해져, ` +
    `${zhi.desc} 면모가 함께 나타납니다.`;

  const traitPhrase = `${gan.traitPhrase}, ${zhi.traitPhrase}`;

  return {
    label: `${gan.gan}${zhi.zhi}`,
    hanjaLabel: `${gan.hanja}${zhi.hanja}`,
    gan,
    zhi,
    axes5,
    weightAxes5,
    traitPhrase,
    character,
    coreImage: `${gan.coreImage} · ${zhi.animal}`,
  };
}
