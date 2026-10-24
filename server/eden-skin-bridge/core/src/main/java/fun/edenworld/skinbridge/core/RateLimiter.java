package fun.edenworld.skinbridge.core;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Fixed-window rate limiter keyed by an arbitrary string (address, player, pairing). The key map
 * is bounded so a flood of distinct keys cannot grow memory without limit.
 */
public final class RateLimiter {
	private final int limit;
	private final long windowMillis;
	private final Clock clock;
	private final Map<String, long[]> windows;

	public RateLimiter(int limit, long windowMillis, int maxKeys, Clock clock) {
		this.limit = limit;
		this.windowMillis = windowMillis;
		this.clock = clock;
		this.windows = new LinkedHashMap<>(64, 0.75f, true) {
			@Override
			protected boolean removeEldestEntry(Map.Entry<String, long[]> eldest) {
				return size() > maxKeys;
			}
		};
	}

	/** Records one attempt and returns whether it is within the limit. */
	public synchronized boolean tryAcquire(String key) {
		long now = clock.millis();
		long[] window = windows.computeIfAbsent(key, k -> new long[] {now, 0});
		if (now - window[0] >= windowMillis) {
			window[0] = now;
			window[1] = 0;
		}
		if (window[1] >= limit) {
			return false;
		}
		window[1]++;
		return true;
	}
}
