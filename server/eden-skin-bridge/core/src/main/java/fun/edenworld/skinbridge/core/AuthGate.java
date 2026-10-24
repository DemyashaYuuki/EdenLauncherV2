package fun.edenworld.skinbridge.core;

import java.util.concurrent.CompletableFuture;

/**
 * Proves that a connected player has completed authentication with the server's auth plugin
 * (including a second factor when enabled). Implementations must fail closed.
 */
public interface AuthGate {
	String adapterName();

	Readiness readiness();

	CompletableFuture<AuthDecision> verify(PlayerRef player);

	record Readiness(boolean ready, String detail) {
		public static Readiness ok() {
			return new Readiness(true, null);
		}

		public static Readiness notReady(String detail) {
			return new Readiness(false, detail);
		}
	}

	record AuthDecision(boolean authenticated, String reason) {
		public static AuthDecision allowed() {
			return new AuthDecision(true, null);
		}

		public static AuthDecision denied(String reason) {
			return new AuthDecision(false, reason);
		}
	}
}
