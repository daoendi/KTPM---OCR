import CircuitBreaker from "opossum";
import { incr } from "./metrics.js";

// Registry to keep track of created breakers and their state
const breakersRegistry = new Map();

export function createBreaker(fn, options = {}) {
  const defaultOptions = {
    timeout: 10000, // 10s
    errorThresholdPercentage: 50, // open when 50% of requests fail
    resetTimeout: 30000, // try again after 30s
    ...options,
  };

  const name =
    options.name || fn.name || `breaker_${breakersRegistry.size + 1}`;
  const breaker = new CircuitBreaker(fn, defaultOptions);

  // Local state tracking because opossum does not expose a simple getter
  const state = { value: "closed" };

  const updateState = (s) => {
    state.value = s;
    const entry = breakersRegistry.get(name) || {};
    breakersRegistry.set(name, {
      name,
      state: s,
      options: defaultOptions,
      stats: entry.stats || {},
    });
  };

  // Logging hooks + update registry
  breaker.on("open", () => {
    console.warn("Circuit breaker OPEN for", name);
    updateState("open");
    // increment breaker open metric
    try {
      incr("breaker_open_count");
    } catch (e) {
      // ignore metric errors
    }
  });
  breaker.on("halfOpen", () => {
    console.info("Circuit breaker HALF-OPEN for", name);
    updateState("halfOpen");
  });
  breaker.on("close", () => {
    console.info("Circuit breaker CLOSED for", name);
    updateState("closed");
  });
  breaker.on("fallback", (data) =>
    console.info("Circuit breaker fallback for", name, data)
  );
  breaker.on("reject", (err) =>
    console.warn(
      "Circuit breaker rejected execution for",
      name,
      err?.message || err
    )
  );
  breaker.on("timeout", () =>
    console.warn("Circuit breaker timeout for", name)
  );

  // track some stats (requests, failures) if available
  breaker.on("success", () => {
    const entry = breakersRegistry.get(name) || {
      name,
      state: state.value,
      options: defaultOptions,
      stats: { success: 0, failure: 0 },
    };
    entry.stats.success = (entry.stats.success || 0) + 1;
    breakersRegistry.set(name, entry);
  });
  breaker.on("failure", () => {
    const entry = breakersRegistry.get(name) || {
      name,
      state: state.value,
      options: defaultOptions,
      stats: { success: 0, failure: 0 },
    };
    entry.stats.failure = (entry.stats.failure || 0) + 1;
    breakersRegistry.set(name, entry);
  });

  // initialize registry entry
  breakersRegistry.set(name, {
    name,
    state: state.value,
    options: defaultOptions,
    stats: { success: 0, failure: 0 },
  });

  // Attach a convenience property to get state
  breaker.__cbName = name;
  breaker.__getState = () => state.value;

  return breaker;
}

export function getBreakersReport() {
  const out = [];
  for (const [k, v] of breakersRegistry.entries()) {
    out.push({
      name: v.name,
      state: v.state,
      options: v.options,
      stats: v.stats,
    });
  }
  return out;
}
