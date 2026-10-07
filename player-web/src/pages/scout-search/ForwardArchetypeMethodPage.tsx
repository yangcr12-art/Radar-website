import React, { useEffect, useMemo, useState } from "react";
import { fetchScoutingModels } from "../../api/storageClient";
import { getProjectZhByColumn } from "../../utils/projectMappingStore";
import WingerArchetypeMethod from "./WingerArchetypeMethod";
import AttackingMidfielderArchetypeMethod from "./AttackingMidfielderArchetypeMethod";
import CentralMidfielderArchetypeMethod from "./CentralMidfielderArchetypeMethod";
import DefensiveMidfielderArchetypeMethod from "./DefensiveMidfielderArchetypeMethod";

type RoleMetricDefinition = {
  column: string;
  label?: string;
  note?: string;
  weight: number;
  direction: "higher" | "lower" | string;
  derived?: { operation: string; columns: string[] } | null;
  coupledGroupId?: string;
  coupledGroupLabel?: string;
  coupledFormula?: string;
  coupledBayesFormula?: string;
};

type DisplayRoleMetricDefinition = RoleMetricDefinition & { members: RoleMetricDefinition[] };

type RoleModelDefinition = {
  id: string;
  version: string;
  name: string;
  family: string;
  qualityLevel: string;
  description: string;
  positionTokens: string[];
  footMode: string;
  usesFootFilter: boolean;
  dimensions: Array<{
    id: string;
    name: string;
    weight: number;
    metrics: RoleMetricDefinition[];
  }>;
  notScored: Array<{ column: string; reason: string }>;
};

const ROLE_FAMILIES = ["中锋", "边锋", "前腰", "中前卫", "后腰", "边后卫", "中卫", "门将"];

type PillarDefinition = {
  name: string;
  description: string;
  metrics: Array<{ name: string; weight: string }>;
};

const PILLARS: PillarDefinition[] = [
  {
    name: "支点参与",
    description: "衡量背身接触、赢得定位球与接应长传的参与倾向。",
    metrics: [
      { name: "对抗占总行动比例", weight: "55%" },
      { name: "每90分钟被犯规", weight: "20%" },
      { name: "每90分钟接到长传", weight: "25%" }
    ]
  },
  {
    name: "制空倾向",
    description: "区分高空球参与强度与对抗结构，不使用成功率评价制空能力。",
    metrics: [
      { name: "每90分钟空中对抗", weight: "60%" },
      { name: "空中对抗占全部对抗比例", weight: "40%" }
    ]
  },
  {
    name: "禁区存在",
    description: "衡量球员出现在终结区域并完成射门动作的频率。",
    metrics: [
      { name: "每90分钟禁区触球", weight: "45%" },
      { name: "每90分钟射门", weight: "30%" },
      { name: "射门占总行动比例", weight: "25%" }
    ]
  },
  {
    name: "纵深冲击",
    description: "衡量无球前插、冲刺强度与速度上限。",
    metrics: [
      { name: "每90分钟加速", weight: "30%" },
      { name: "每90分钟推进跑动", weight: "30%" },
      { name: "每90分钟冲刺距离", weight: "25%" },
      { name: "最高速度", weight: "15%" }
    ]
  },
  {
    name: "持球突破",
    description: "衡量通过带球、个人进攻对抗和传中向前制造变化的倾向。",
    metrics: [
      { name: "盘带占总行动比例", weight: "35%" },
      { name: "每90分钟盘带", weight: "30%" },
      { name: "每90分钟进攻对抗", weight: "20%" },
      { name: "每90分钟传中", weight: "15%" }
    ]
  },
  {
    name: "连接参与",
    description: "衡量参与传接球、回接以及向禁区输送球权的程度。",
    metrics: [
      { name: "传球占总行动比例", weight: "25%" },
      { name: "每90分钟接球", weight: "25%" },
      { name: "每90分钟传入禁区", weight: "20%" },
      { name: "每90分钟关键传球", weight: "15%" },
      { name: "每90分钟推进传球", weight: "15%" }
    ]
  },
  {
    name: "组织创造",
    description: "衡量主动为队友制造射门和穿透防线的行为频率，不直接评价机会质量。",
    metrics: [
      { name: "每90分钟关键传球", weight: "35%" },
      { name: "每90分钟助攻射门传球", weight: "25%" },
      { name: "每90分钟传入禁区", weight: "20%" },
      { name: "每90分钟直塞", weight: "20%" }
    ]
  },
  {
    name: "跑动防守",
    description: "衡量无球覆盖与防守行动参与。",
    metrics: [
      { name: "每90分钟成功防守动作", weight: "55%" },
      { name: "每90分钟总距离", weight: "45%" }
    ]
  }
];

const ROLE_EVIDENCE_MODELS = [
  { name: "支点中锋", core: "支点×制空几何均值", support: "连接、禁区存在", formula: "65%×√(支点×制空) + 20%×连接 + 15%×禁区" },
  { name: "抢点型前锋", core: "禁区行为必须主导", support: "制空参与、纵深到位", formula: "50%×禁区 + 35%×制空 + 15%×纵深；禁区须高于纵深/持球均值至少10分" },
  { name: "冲击型前锋", core: "纵深×持球几何均值", support: "支点、跑动防守", formula: "65%×√(纵深×持球) + 25%×支点 + 10%×跑动防守" },
  { name: "组织型前锋", core: "组织创造", support: "回撤连接、持球推进", formula: "50%×组织创造 + 35%×连接 + 15%×持球" },
  { name: "全能前锋", core: "五类核心行为均无明显短板", support: "最弱项≥40、五项均值≥65、覆盖≥98%", formula: "（45%×覆盖 + 30%×连接/创造 + 15%×均衡 + 10%×均值 − 直接偏置）^1.35；先通过严格准入门槛" }
];

function mergeCoupledRoleMetrics(metrics: RoleMetricDefinition[]): DisplayRoleMetricDefinition[] {
  const output: DisplayRoleMetricDefinition[] = [];
  const groups = new Map<string, DisplayRoleMetricDefinition>();
  metrics.forEach((metric) => {
    if (!metric.coupledGroupId) {
      output.push({ ...metric, members: [metric] });
      return;
    }
    const existing = groups.get(metric.coupledGroupId);
    if (existing) {
      existing.members.push(metric);
      existing.weight += metric.weight;
      return;
    }
    const merged: DisplayRoleMetricDefinition = {
      ...metric,
      column: `coupled:${metric.coupledGroupId}`,
      label: metric.coupledGroupLabel || metric.label || metric.column,
      members: [metric]
    };
    groups.set(metric.coupledGroupId, merged);
    output.push(merged);
  });
  return output;
}

function derivedMetricFormula(metric: RoleMetricDefinition) {
  if (!metric.derived) return "";
  if (metric.derived.operation === "ratio_percent") return `${metric.derived.columns[0]} ÷ ${metric.derived.columns[1]} × 100`;
  return metric.derived.columns.join(" − ");
}

function ForwardArchetypeMethodPage() {
  const [models, setModels] = useState<RoleModelDefinition[]>([]);
  const [selectedFamily, setSelectedFamily] = useState("中锋");
  const [selectedRoleId, setSelectedRoleId] = useState("target_forward");
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    let active = true;
    fetchScoutingModels()
      .then((response) => {
        if (!active) return;
        setModels(Array.isArray(response.models) ? response.models : []);
        setCatalogError("");
      })
      .catch((error) => {
        if (!active) return;
        setCatalogError(`职责算法目录读取失败：${error.message}`);
      });
    return () => {
      active = false;
    };
  }, []);

  const familyModels = useMemo(
    () => models.filter((model) => model.family === selectedFamily),
    [models, selectedFamily]
  );
  const selectedModel = useMemo(
    () => familyModels.find((model) => model.id === selectedRoleId) || familyModels[0] || null,
    [familyModels, selectedRoleId]
  );

  useEffect(() => {
    if (familyModels.length > 0 && !familyModels.some((model) => model.id === selectedRoleId)) {
      setSelectedRoleId(familyModels[0].id);
    }
  }, [familyModels, selectedRoleId]);

  const metricName = (metric: RoleMetricDefinition) => metric.label || getProjectZhByColumn(metric.column) || metric.column;

  return (
    <section className="info-page scout-method-page">
      <div className="info-card scout-method-shell">
        <header className="scout-method-hero">
          <div>
            <p className="scout-search-kicker">Research · Role Library v2</p>
            <h1>全位置职责算法库</h1>
            <p>
              选择位置与职责，查看当前系统实际使用的维度、指标和权重。中锋、边锋、前腰、中前卫和后腰另提供各自独立的职责相似度识别。
            </p>
          </div>
          <span className="scout-method-status">26 个中文职责 · 当前实现口径</span>
        </header>

        <section className="scout-role-library-controls">
          <label>
            <span>选择位置</span>
            <select value={selectedFamily} onChange={(event) => setSelectedFamily(event.target.value)}>
              {ROLE_FAMILIES.map((family) => <option key={family} value={family}>{family}</option>)}
            </select>
          </label>
          <label>
            <span>选择职责</span>
            <select value={selectedModel?.id || selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)} disabled={familyModels.length === 0}>
              {familyModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </label>
          <div className="scout-role-library-count">
            <span>当前位置职责</span>
            <strong>{familyModels.length || "–"}</strong>
          </div>
        </section>

        {catalogError ? <p className="msg err">{catalogError}</p> : null}

        {selectedModel ? (
          <>
            <section className="scout-role-overview">
              <div>
                <p className="scout-search-kicker">{selectedModel.qualityLevel} · {selectedModel.version}</p>
                <h2>{`${selectedModel.family} · ${selectedModel.name}`}</h2>
                <p>{selectedModel.description}</p>
              </div>
              <dl>
                <div><dt>候选位置</dt><dd>{selectedModel.positionTokens.join(" / ")}</dd></div>
                <div><dt>职责维度</dt><dd>{selectedModel.dimensions.length}</dd></div>
                <div><dt>指标总权重</dt><dd>100%</dd></div>
                <div><dt>足侧筛选</dt><dd>{selectedModel.usesFootFilter ? "启用" : "不启用"}</dd></div>
              </dl>
            </section>

            <section className="scout-method-section">
              <div className="scout-method-section-head">
                <div><span className="scout-method-number">A</span><h2>职责维度与指标权重</h2></div>
                <p>页面直接读取后端职责目录；存在次数与成功率配对时展示实际生效的量效耦合指标，原始字段保留为来源说明</p>
              </div>
              <div className="scout-role-dimension-grid">
                {selectedModel.dimensions.map((dimension) => (
                  <article key={dimension.id}>
                    <header><h3>{dimension.name}</h3><strong>{dimension.weight}%</strong></header>
                    <ul>
                      {mergeCoupledRoleMetrics(dimension.metrics).map((metric) => (
                        <li key={metric.column}>
                          <div>
                            <span>{metricName(metric)}</span>
                            {metric.members.length > 1 ? (
                              <>
                                <small>{`来源：${metric.members.map((member) => `${metricName(member)} ${member.weight}%`).join(" + ")}`}</small>
                                <small>{metric.coupledBayesFormula}</small>
                                <small>{metric.coupledFormula}</small>
                              </>
                            ) : <small>{metric.column}</small>}
                            {metric.derived ? <small>{`计算：${derivedMetricFormula(metric)}`}</small> : null}
                            {metric.note ? <small>{metric.note}</small> : null}
                          </div>
                          <aside><b>{metric.weight}%</b><em>{metric.direction === "lower" ? "越低越好" : "越高越好"}</em></aside>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>

            <section className="scout-role-score-method">
              <article><span>1</span><div><b>指标计分</b><p>{selectedFamily === "中锋" ? "对抗、空中对抗、盘带和射门转化在次数与成功率同时存在时先合成为修正有效性；其他指标按项目对应表百分位计分，缺失回退中性50分。" : "按项目对应表选择普通、反向或稀疏事件百分位；缺失指标回退中性50分。"}</p></div></article>
              <article><span>2</span><div><b>维度得分</b><p>Σ（指标计分百分位 × 指标权重）÷ 维度权重。</p></div></article>
              <article><span>3</span><div><b>职责能力分</b><p>Σ（指标计分百分位 × 指标权重）÷ 100；权重不因页面筛选而改写。</p></div></article>
              <article><span>4</span><div><b>分钟可靠度</b><p>最终分 = 50 + min（1，分钟 ÷ 500）×（原始职责分 − 50）。</p></div></article>
            </section>
          </>
        ) : !catalogError ? <p className="scout-role-library-loading">正在读取职责算法目录…</p> : null}

        {selectedFamily === "中锋" ? (
          <>
            <div className="scout-role-archetype-divider">
              <span>中锋额外算法</span>
              <h2>五类中锋独立职责相似度</h2>
              <p>以下部分独立于上方职责能力分，用于回答球员实际承担了哪些中锋工作。</p>
            </div>

        <section className="scout-method-flow" aria-label="算法流程">
          {["原始数据", "同位置百分位", "8个行为支柱", "计算5类独立相似度", "职责标签与可信度"].map((step, index) => (
            <React.Fragment key={step}>
              <div><b>{index + 1}</b><span>{step}</span></div>
              {index < 4 ? <i aria-hidden="true">→</i> : null}
            </React.Fragment>
          ))}
        </section>

        <section className="scout-method-split">
          <article className="scout-method-card scout-method-card-accent">
            <span className="scout-method-number">01</span>
            <div>
              <h2>先构造行为占比</h2>
              <p>总行动分母优先读取源表；字段缺失时才使用代理结构，并在球员详情中标明。</p>
              <ol>
                <li><b>优先：</b>源表“每90分钟总行动数”</li>
                <li><b>其次：</b>源表“总行动数”按分钟换算为每90分钟</li>
                <li><b>回退：</b>对抗 + 传球 + 射门 + 盘带</li>
              </ol>
              <div className="scout-method-formula">
                行为占比 = 该行为每90分钟次数 ÷ 每90分钟总行动数
              </div>
              <small>空中对抗占比单独使用：空中对抗 ÷ 全部对抗。禁区触球不进入代理分母，避免重复计算。</small>
            </div>
          </article>

          <article className="scout-method-card">
            <span className="scout-method-number">02</span>
            <div>
              <h2>统一成同位置百分位</h2>
              <p>每个原始特征只与当前中锋比较群体进行比较，转换为 0–1 的并列中位标准百分位。</p>
              <div className="scout-method-formula">
                特征百分位 =（低于人数 + 0.5 × 同值人数）÷ 样本数
              </div>
              <ul>
                <li>单个特征有效样本少于 8 人时，不参与支柱计算。</li>
                <li>缺失特征不填 0；按该支柱剩余可用权重重新归一。</li>
                <li>此处使用普通标准百分位，不使用稀疏事件算法。</li>
              </ul>
            </div>
          </article>
        </section>

        <section className="scout-method-section">
          <div className="scout-method-section-head">
            <div>
              <span className="scout-method-number">03</span>
              <h2>形成 8 个行为支柱</h2>
            </div>
            <p>支柱分 = Σ（可用特征百分位 × 特征权重）÷ Σ（可用特征权重）</p>
          </div>
          <div className="scout-method-pillar-grid">
            {PILLARS.map((pillar) => (
              <article key={pillar.name}>
                <h3>{pillar.name}</h3>
                <p>{pillar.description}</p>
                <ul>
                  {pillar.metrics.map((metric) => (
                    <li key={metric.name}><span>{metric.name}</span><b>{metric.weight}</b></li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="scout-method-section">
          <div className="scout-method-section-head">
            <div>
              <span className="scout-method-number">04</span>
              <h2>计算 5 类独立职责相似度</h2>
            </div>
              <p>五种职责各自得到0–100分，互不挤占，不要求合计100；一名球员可以同时高度符合两种职责。</p>
          </div>
          <div className="scout-method-table-wrap">
            <table className="scout-method-table">
              <thead>
                <tr>
                  <th>职责</th>
                  <th>必要核心</th>
                  <th>辅助证据</th>
                  <th>相似度公式</th>
                </tr>
              </thead>
              <tbody>
                {ROLE_EVIDENCE_MODELS.map((model) => (
                  <tr key={model.name}>
                    <th>{model.name}</th>
                    <td>{model.core}</td>
                    <td>{model.support}</td>
                    <td>{model.formula}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="scout-method-split">
          <article className="scout-method-card scout-method-card-dark">
            <span className="scout-method-number">05</span>
            <div>
              <h2>独立相似度，不做概率归一</h2>
              <p>每种职责直接保留0–100的行为相似度。至少有4个行为支柱时才开始判断，全能前锋必须覆盖全部五类行为轴。</p>
              <div className="scout-method-formula scout-method-formula-dark">
                职责相似度ᵢ = 该职责可用行为支柱的加权得分<br />
                五项相似度互相独立，不要求合计100
              </div>
              <ul>
                <li>相似度只回答“做了什么”，成功率、xG转化和量效耦合仍属于职责能力分。</li>
                <li>抢点型要求禁区存在至少比纵深与持球的平均参与高10分，再读取禁区、制空和纵深；三项同时极高的直接冲击者不再被抢点型优先吸收。</li>
                <li>全能型先检查支点制空、禁区终结、纵深突破、回撤连接和组织创造：最弱项至少40分、五项均值至少65分、柔性覆盖至少98%才有资格进入全能型候选。</li>
                <li>若支点、纵深和持球明显压过连接与创造，会扣除直接打法偏置，避免“什么字段都有”就自动成为全能型。</li>
              </ul>
              <small>职责相似度与职责能力分相互独立；这里不读取职责总分、尖点奖励、成功率或最终可靠度分。</small>
            </div>
          </article>

          <article className="scout-method-card">
            <span className="scout-method-number">06</span>
            <div>
              <h2>职责标签怎么确定</h2>
              <p>系统保留最高和第二相似度，但标签默认只显示一个主职责；只有“双高分且几乎并列”才例外显示复合型。</p>
              <div className="scout-method-thresholds">
                <div><b>两项均≥70且差≤3分</b><span>允许显示双职责</span></div>
                <div><b>或两项均≥65且差≤2分</b><span>允许中高强度、几乎并列的双职责</span></div>
                <div><b>全能准入：最弱轴≥40、五轴均值≥65、覆盖≥98%</b><span>全部满足才能显示全能前锋</span></div>
                <div><b>全能通过准入且距最高专项≤3分</b><span>直接显示全能前锋，不再制造一个专项/全能双标签</span></div>
                <div><b>最高相似度≥45</b><span>默认显示一个主职责，接近程度交给职责区分度表达</span></div>
                <div><b>最高相似度&lt;45</b><span>才显示“职责特征不突出”</span></div>
              </div>
              <div className="scout-method-formula">职责区分度 = min（1，第一相似度与第二相似度之差 ÷ 20）</div>
              <p><b>位置只影响可信度：</b>CF是第一位置时位置可靠度100%；第二位置75%；第三及以后55%。位置顺序不再改写职责标签，避免把“球员在做什么”和“数据是否足以支持判断”重新混在一起。</p>
              <p><b>全能前锋：</b>现在不再是“五类工作都沾边”，而是五类核心行为在同位置群体中都达到明确门槛且整体水平较高。这仍是行为结构识别，最终完成质量仍由职责能力分评价。</p>
            </div>
          </article>
        </section>

        <section className="scout-method-section scout-method-confidence">
          <div className="scout-method-section-head">
            <div>
              <span className="scout-method-number">07</span>
              <h2>数据可信度与职责区分度</h2>
            </div>
            <p>数据可信度回答“现有数据是否足够”；职责区分度回答“第一和第二职责是否容易区分”。复合型可以数据可信度高但区分度低。</p>
          </div>
          <div className="scout-method-confidence-grid">
            <div><b>字段覆盖率</b><span>8 个支柱中实际可用特征权重的平均覆盖程度</span></div>
            <strong>×</strong>
            <div><b>分钟可靠度</b><span>min（1，出场分钟 ÷ 满可靠度分钟）</span></div>
            <strong>×</strong>
            <div><b>位置可靠度</b><span>CF为第一/第二/第三及以后位置：100%/75%/55%</span></div>
            <strong>=</strong>
            <div><b>数据可信度</b><span>三项相乘，不因球员属于复合型而被压低</span></div>
          </div>
          <div className="scout-method-formula">
            数据可信度 = 字段覆盖率 × 分钟可靠度 × 位置可靠度<br />
            职责区分度 = min（1，第一与第二相似度差 ÷ 20）
          </div>
          <small>两项都不参与职责能力分或职责相似度，只用于解释结论边界。</small>
        </section>

        <section className="scout-method-notes">
          <div>
            <h2>如何理解“当前职责相似度”</h2>
            <p>
              它表示球员在页面当前所选职责中的行为相似程度。它不一定是该球员五类职责中的最高分，
              也不会改变职责能力分、尖点奖励或能力排名。
            </p>
          </div>
          <div>
            <h2>使用边界</h2>
            <ul>
              <li>这是 Research 口径，职责公式来自足球角色先验，仍需熟悉球员样本人工复核。</li>
              <li>职责相似度是联赛与位置群体内的相对行为结构，不是跨联赛的绝对能力值。</li>
              <li>源表是多位置整季合计数据；CF不是第一位置时，职责结论只作低可信度参考。</li>
              <li>进球、Goal − xG、转化率等结果指标不直接决定职责，避免“进球多就一定是抢点型”的误判。</li>
              <li>字段缺失会降低可信度；数据不足时页面显示“数据不足”，不强行归类。</li>
            </ul>
          </div>
        </section>
          </>
        ) : selectedFamily === "边锋" ? (
          <WingerArchetypeMethod />
        ) : selectedFamily === "前腰" ? (
          <AttackingMidfielderArchetypeMethod />
        ) : selectedFamily === "中前卫" ? (
          <CentralMidfielderArchetypeMethod />
        ) : selectedFamily === "后腰" ? (
          <DefensiveMidfielderArchetypeMethod />
        ) : (
          <section className="scout-role-archetype-unavailable">
            <strong>{`${selectedFamily}当前使用职责能力评分`}</strong>
            <p>该位置的不同职责已在上方按独立维度与指标权重完整列出。独立职责相似度识别目前完成中锋、边锋、前腰、中前卫和后腰试验版；其他位置不会套用现有公式，也不会用未经验证的参数强行分类。</p>
          </section>
        )}
      </div>
    </section>
  );
}

export default ForwardArchetypeMethodPage;
