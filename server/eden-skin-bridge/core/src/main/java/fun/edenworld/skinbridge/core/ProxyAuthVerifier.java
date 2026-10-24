package fun.edenworld.skinbridge.core;

import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.logging.Logger;

/**
 * Backend side of the proxy authentication handshake: issues single-use nonces and accepts only
 * signed, fresh replies that match the nonce, the receiving player and this server's name.
 */
public final class ProxyAuthVerifier {
	private record Outstanding(PlayerRef player, CompletableFuture<AuthGate.AuthDecision> future) {}

	private static final int MAX_OUTSTANDING = 512;

	private final byte[] secret;
	private final String serverName;
	private final Clock clock;
	private final Duration timeout;
	private final Logger logger;
	private final Map<String, Outstanding> outstanding = new LinkedHashMap<>();

	public ProxyAuthVerifier(byte[] secret, String serverName, Clock clock, Duration timeout, Logger logger) {
		this.secret = secret;
		this.serverName = serverName;
		this.clock = clock;
		this.timeout = timeout;
		this.logger = logger;
	}

	public boolean configured() {
		return secret != null && secret.length >= AuthAssertion.MIN_SECRET_BYTES && serverName != null && !serverName.isBlank();
	}

	/** Sends a query through {@code sender} (the player's connection) and waits for the signed reply. */
	public CompletableFuture<AuthGate.AuthDecision> request(PlayerRef player, Consumer<byte[]> sender) {
		if (!configured()) {
			return CompletableFuture.completedFuture(AuthGate.AuthDecision.denied("proxy_secret_missing"));
		}
		byte[] nonce = SecureTokens.randomBytes(16);
		String key = HexFormat.of().formatHex(nonce);
		CompletableFuture<AuthGate.AuthDecision> future = new CompletableFuture<>();
		synchronized (outstanding) {
			if (outstanding.size() >= MAX_OUTSTANDING) {
				return CompletableFuture.completedFuture(AuthGate.AuthDecision.denied("busy"));
			}
			outstanding.put(key, new Outstanding(player, future));
		}
		CompletableFuture<AuthGate.AuthDecision> bounded = future
				.completeOnTimeout(AuthGate.AuthDecision.denied("proxy_timeout"), timeout.toMillis(), TimeUnit.MILLISECONDS)
				.whenComplete((decision, error) -> {
					synchronized (outstanding) {
						outstanding.remove(key);
					}
				});
		try {
			sender.accept(AuthAssertion.encodeQuery(new AuthAssertion.Query(nonce, player.uuid(), clock.millis())));
		} catch (RuntimeException e) {
			future.complete(AuthGate.AuthDecision.denied("proxy_unreachable"));
		}
		return bounded;
	}

	/** Handles a message that arrived on the auth channel for {@code receiver}. */
	public void onReply(PlayerRef receiver, byte[] message) {
		AuthAssertion.Reply reply;
		try {
			reply = AuthAssertion.decodeReply(message, secret, clock);
		} catch (AuthAssertion.InvalidAssertionException e) {
			logger.warning("Rejected proxy auth message for " + receiver.name() + ": " + e.getMessage());
			return;
		}
		String key = HexFormat.of().formatHex(reply.nonce());
		Outstanding entry;
		synchronized (outstanding) {
			entry = outstanding.remove(key);
		}
		if (entry == null) {
			logger.warning("Rejected proxy auth reply with unknown or reused nonce for " + receiver.name());
			return;
		}
		if (!entry.player().uuid().equals(receiver.uuid()) || !reply.player().equals(receiver.uuid())) {
			entry.future().complete(AuthGate.AuthDecision.denied("identity_mismatch"));
			return;
		}
		if (!serverName.equals(reply.server())) {
			entry.future().complete(AuthGate.AuthDecision.denied("wrong_server"));
			return;
		}
		entry.future().complete(
				reply.authenticated()
						? AuthGate.AuthDecision.allowed()
						: AuthGate.AuthDecision.denied("not_authenticated:" + reply.adapter()));
	}

	public int pending() {
		synchronized (outstanding) {
			return outstanding.size();
		}
	}
}
