/**
 * 轻量异常预测（逻辑回归）
 *
 * 训练数据：
 * - 特征：temperature / humidity / soil_moisture
 * - 标签：未来时间窗内是否出现异常记录（crop_exception）
 *
 * 输出：
 * - 异常概率（0~1）
 *
 * 约束：
 * - 不引入复杂 ML 依赖
 * - 可在 Node/Express 环境直接运行
 */
const FEATURE_NAMES = ['temperature', 'humidity', 'soil_moisture']

let model = null

function sigmoid(z) {
  if (z > 35) return 1
  if (z < -35) return 0
  return 1 / (1 + Math.exp(-z))
}

function dot(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function standardizeRow(row, mean, std) {
  const x = []
  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    const v = row[i]
    const m = mean[i]
    const sd = std[i]
    x.push(sd > 1e-9 ? (v - m) / sd : 0)
  }
  return x
}

function computeMeanStd(X) {
  const n = X.length
  const d = X[0]?.length || 0
  const mean = new Array(d).fill(0)
  const std = new Array(d).fill(0)
  for (const x of X) {
    for (let j = 0; j < d; j++) mean[j] += x[j]
  }
  for (let j = 0; j < d; j++) mean[j] /= Math.max(1, n)
  for (const x of X) {
    for (let j = 0; j < d; j++) std[j] += (x[j] - mean[j]) ** 2
  }
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / Math.max(1, n))
  return { mean, std }
}

function trainLogisticRegression(Xraw, y, opts = {}) {
  const lr = Number(opts.lr ?? 0.15)
  const iters = Math.max(50, Number(opts.iters ?? 220))
  const reg = Number(opts.l2 ?? 0.001)

  const { mean, std } = computeMeanStd(Xraw)
  const X = Xraw.map((x) => standardizeRow(x, mean, std))
  const n = X.length
  const d = X[0].length

  // weights + bias
  const w = new Array(d).fill(0)
  let b = 0

  for (let it = 0; it < iters; it++) {
    const gradW = new Array(d).fill(0)
    let gradB = 0
    for (let i = 0; i < n; i++) {
      const p = sigmoid(dot(w, X[i]) + b)
      const err = p - y[i]
      for (let j = 0; j < d; j++) gradW[j] += err * X[i][j]
      gradB += err
    }
    for (let j = 0; j < d; j++) {
      gradW[j] = gradW[j] / n + reg * w[j]
      w[j] -= lr * gradW[j]
    }
    b -= lr * (gradB / n)
  }

  // 训练集简单评估
  let correct = 0
  for (let i = 0; i < n; i++) {
    const p = sigmoid(dot(w, X[i]) + b)
    const pred = p >= 0.5 ? 1 : 0
    if (pred === y[i]) correct += 1
  }

  return {
    w,
    b,
    mean,
    std,
    trained_at: new Date().toISOString(),
    train_size: n,
    train_acc: n ? correct / n : 0
  }
}

async function loadTrainingData(pool, { limit = 5000, horizonMinutes = 90 } = {}) {
  const lim = Math.min(20000, Math.max(200, Number(limit) || 5000))
  const horizon = Math.min(240, Math.max(30, Number(horizonMinutes) || 90))

  // 标签：未来 horizon 分钟内，同 farm + plant_area 出现异常记录则为 1
  const [rows] = await pool.execute(
    `
      SELECT
        em.farm_id,
        COALESCE(em.plant_area,'') AS plant_area,
        em.temperature,
        em.humidity,
        em.soil_moisture,
        em.monitor_time,
        EXISTS(
          SELECT 1
          FROM crop_exception ce
          INNER JOIN crop c ON c.crop_id = ce.crop_id
          WHERE c.farm_id = em.farm_id
            AND COALESCE(c.plant_area,'') = COALESCE(em.plant_area,'')
            AND COALESCE(ce.source_type,'manual') <> 'ml'
            AND ce.exception_type IN ('温度异常','湿度过低','建议灌溉','缺水')
            AND ce.exception_time >= em.monitor_time
            AND ce.exception_time <= em.monitor_time + INTERVAL ${Number(horizon)} MINUTE
          LIMIT 1
        ) AS y
      FROM environment_monitor em
      WHERE em.temperature IS NOT NULL
        AND em.humidity IS NOT NULL
        AND em.soil_moisture IS NOT NULL
      ORDER BY em.monitor_time DESC
      LIMIT ${Number(lim)}
    `,
    []
  )

  const X = []
  const y = []
  for (const r of rows || []) {
    const t = Number(r.temperature)
    const h = Number(r.humidity)
    const sm = Number(r.soil_moisture)
    if ([t, h, sm].some((v) => Number.isNaN(v))) continue
    X.push([t, h, sm])
    y.push(r.y ? 1 : 0)
  }
  return { X, y, meta: { rows: rows?.length || 0, used: X.length, horizonMinutes: horizon } }
}

async function trainPredictor(pool) {
  const { X, y, meta } = await loadTrainingData(pool)
  if (!X.length || X.length < 60) {
    model = null
    return { ok: false, reason: '训练数据不足', meta }
  }
  model = trainLogisticRegression(X, y)
  return { ok: true, model }
}

function predictProbability(features) {
  if (!model) return null
  const xRaw = FEATURE_NAMES.map((k) => Number(features?.[k]))
  if (xRaw.some((v) => !Number.isFinite(v))) return null
  const x = standardizeRow(xRaw, model.mean, model.std)
  return sigmoid(dot(model.w, x) + model.b)
}

function getModelInfo() {
  return model
    ? {
        trained_at: model.trained_at,
        train_size: model.train_size,
        train_acc: model.train_acc,
        features: FEATURE_NAMES
      }
    : null
}

module.exports = {
  trainPredictor,
  predictProbability,
  getModelInfo
}

