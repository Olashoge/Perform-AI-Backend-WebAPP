import { computePerformanceState } from "./performanceState";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function runTests() {
  {
    const result = computePerformanceState({
      currentWeekOverallScore: 90,
      previousWeekOverallScore: 80,
      last4WeeksOverallScores: [70, 75, 80, 90],
      streakDays: 7,
    });
    assert(result.pcs >= 0.75, `High performer should be on_track, got pcs=${result.pcs}`);
    assert(result.label === "on_track", `Expected on_track, got ${result.label}`);
    assert(result.deltaPoints === 10, `Delta should be 10, got ${result.deltaPoints}`);
    assert(result.streakDays === 7, `Streak should be 7`);
    assert(result.explanation.length >= 2 && result.explanation.length <= 4, `Expected 2-4 explanations`);
    console.log("✓ Test 1 passed: High performer on_track");
  }

  {
    const result = computePerformanceState({
      currentWeekOverallScore: 20,
      previousWeekOverallScore: 60,
      last4WeeksOverallScores: [70, 50, 60, 20],
      streakDays: 0,
    });
    assert(result.label === "declining" || result.label === "at_risk", `Expected declining/at_risk, got ${result.label}`);
    assert(result.deltaPoints === -40, `Delta should be -40, got ${result.deltaPoints}`);
    console.log("✓ Test 2 passed: Declining performer");
  }

  {
    const result = computePerformanceState({
      currentWeekOverallScore: 50,
      previousWeekOverallScore: null,
      last4WeeksOverallScores: [50],
      streakDays: 3,
    });
    assert(result.deltaPoints === 0, `Delta should be 0 when no prev, got ${result.deltaPoints}`);
    assert(result.deltaNorm01 === 0.5, `deltaNorm01 should be 0.5 when no prev, got ${result.deltaNorm01}`);
    console.log("✓ Test 3 passed: No previous week");
  }

  {
    const result = computePerformanceState({
      currentWeekOverallScore: 0,
      previousWeekOverallScore: 0,
      last4WeeksOverallScores: [0, 0, 0, 0],
      streakDays: 0,
    });
    assert(result.pcs < 0.30, `All-zero should be declining, got pcs=${result.pcs}`);
    assert(result.label === "declining", `Expected declining, got ${result.label}`);
    console.log("✓ Test 4 passed: All zeros = declining");
  }

  {
    const result = computePerformanceState({
      currentWeekOverallScore: 100,
      previousWeekOverallScore: 100,
      last4WeeksOverallScores: [100, 100, 100, 100],
      streakDays: 7,
    });
    assert(result.pcs >= 0.75, `Perfect score should be on_track, got pcs=${result.pcs}`);
    assert(result.label === "on_track", `Expected on_track, got ${result.label}`);
    assert(result.deltaPoints === 0, `Delta should be 0 for no change`);
    console.log("✓ Test 5 passed: Perfect scores");
  }

  {
    const result = computePerformanceState({
      currentWeekOverallScore: 55,
      previousWeekOverallScore: 50,
      last4WeeksOverallScores: [40, 55],
      streakDays: 2,
    });
    assert(result.trendSlope === 15, `2-week slope should be 15 (55-40), got ${result.trendSlope}`);
    console.log("✓ Test 6 passed: 2-week trend slope");
  }

  {
    const result = computePerformanceState({
      currentWeekOverallScore: 60,
      previousWeekOverallScore: 50,
      last4WeeksOverallScores: [40, 50, 60],
      streakDays: 4,
    });
    assert(result.trendSlope === 10, `3-week slope should be (60-40)/2=10, got ${result.trendSlope}`);
    console.log("✓ Test 7 passed: 3-week trend slope");
  }

  {
    const scores = [40, 50, 55, 65];
    const slope = ((-1.5*scores[0]) + (-0.5*scores[1]) + (0.5*scores[2]) + (1.5*scores[3])) / 5;
    const slopeClamped = Math.min(10, Math.max(-10, slope));
    const trendNorm = (slopeClamped + 10) / 20;
    const deltaClamped = Math.min(25, Math.max(-25, 15));
    const deltaNorm = (deltaClamped + 25) / 50;
    const pcsVal = 0.45 * (65/100) + 0.25 * deltaNorm + 0.20 * trendNorm + 0.10 * (4/7);
    const result = computePerformanceState({
      currentWeekOverallScore: 65,
      previousWeekOverallScore: 50,
      last4WeeksOverallScores: scores,
      streakDays: 4,
    });
    assert(Math.abs(result.pcs - Math.round(pcsVal * 1000) / 1000) < 0.01, `PCS math check failed: expected ~${(Math.round(pcsVal * 1000) / 1000)}, got ${result.pcs}`);
    console.log("✓ Test 8 passed: PCS composite formula verification");
  }

  console.log("\nAll tests passed!");
}

runTests();
