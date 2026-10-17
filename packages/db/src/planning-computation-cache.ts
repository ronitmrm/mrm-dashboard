/** Memoized calculations never outlive their planning calendar/build. */
export function createPlanningComputationCache() {
  const identities = new WeakMap<object, number>();
  const workdayCounts = new Map<string, Map<string, number>>();
  let workdayCountEntries = 0;
  let nextIdentity = 0;
  const identity = (value: object | undefined) => {
    if (!value) return 0;
    let id = identities.get(value);
    if (id === undefined) {
      id = ++nextIdentity;
      identities.set(value, id);
    }
    return id;
  };
  return {
    identity,
    workdayOffsets: createBoundedMemo<string, string>(),
    workdayCounts(startDate: string, endDate: string, calculate: () => number) {
      let ends = workdayCounts.get(startDate);
      const cached = ends?.get(endDate);
      if (cached !== undefined) return cached;
      const days = calculate();
      if (workdayCountEntries >= 16384) {
        workdayCounts.clear();
        workdayCountEntries = 0;
        ends = undefined;
      }
      if (!ends) workdayCounts.set(startDate, (ends = new Map()));
      ends.set(endDate, days);
      workdayCountEntries += 1;
      return days;
    },
    productionFinishes: createBoundedMemo<string, { date: string; workingHours: number | null }>(),
    wipReadyDates: createBoundedMemo<string, string>(),
  };
}

export function createBoundedMemo<Key, Value>(maximumEntries = 16384) {
  const values = new Map<Key, { value: Value }>();
  return (key: Key, calculate: () => Value): Value => {
    const cached = values.get(key);
    if (cached) return cached.value;
    const value = calculate();
    if (values.size >= maximumEntries) values.clear();
    values.set(key, { value });
    return value;
  };
}
