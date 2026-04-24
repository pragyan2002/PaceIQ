export function isoWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const dayOfYear =
    Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
  const weekDay = d.getDay() || 7;
  const weekNum = Math.ceil((dayOfYear - weekDay + 10) / 7);

  const year =
    weekNum === 1 && d.getMonth() === 11
      ? d.getFullYear() + 1
      : weekNum >= 52 && d.getMonth() === 0
        ? d.getFullYear() - 1
        : d.getFullYear();

  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denom = n * sumXX - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

export function classifyInsightType(response: string): string {
  const lower = response.toLowerCase();

  if (lower.includes("race") || lower.includes("pr") || lower.includes("personal record")) {
    return "Race Readiness";
  }

  if (lower.includes("injur") || lower.includes("pain") || lower.includes("sore")) {
    return "Injury Analysis";
  }

  if (
    lower.includes("mileage") ||
    lower.includes("volume") ||
    lower.includes("km") ||
    lower.includes("weekly")
  ) {
    return "Volume Review";
  }

  if (
    lower.includes("plan") ||
    lower.includes("training plan") ||
    lower.includes("marathon") ||
    lower.includes("goal")
  ) {
    return "Race Planning";
  }

  return "General";
}
