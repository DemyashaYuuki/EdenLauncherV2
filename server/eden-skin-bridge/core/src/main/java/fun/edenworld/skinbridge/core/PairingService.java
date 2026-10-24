package fun.edenworld.skinbridge.core;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * One-time pairing between a launcher and an authenticated in-game player.
 *
 * <ol>
 *   <li>The launcher starts a pairing and receives a short code (shown to the user) and a separate
 *       poll secret (kept by the launcher backend). Only a hash of the poll secret is stored.
 *   <li>The player runs the link command with the code while authenticated; the pairing becomes
 *       bound to that player's server UUID and a confirmation nonce is offered in chat.
 *   <li>The player confirms in game, then the launcher user confirms the shown player name, and
 *       only then {@link #finalizeLaunch} hands the player identity to the caller (which issues a
 *       token). Every pairing is single use and expires.
 * </ol>
 */
public final class PairingService {
	public static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	public static final int CODE_LENGTH = 8;

	public enum State {
		PENDING,
		CLAIMED,
		AWAITING_LAUNCHER,
		CONFIRMED,
		EXPIRED,
		REJECTED,
		CANCELLED
	}

	public record Start(String pairingId, String code, String pollSecret, long expiresInSeconds) {}

	public record View(State state, PlayerRef player, long expiresInSeconds) {}

	public static final class PairingException extends Exception {
		private static final long serialVersionUID = 1L;
		private final String code;

		public PairingException(String code) {
			super(code);
			this.code = code;
		}

		public String code() {
			return code;
		}
	}

	private static final class Pairing {
		final String id;
		final String code;
		final byte[] pollSecretHash;
		final Instant expiresAt;
		State state = State.PENDING;
		PlayerRef player;
		byte[] confirmNonceHash;

		Pairing(String id, String code, byte[] pollSecretHash, Instant expiresAt) {
			this.id = id;
			this.code = code;
			this.pollSecretHash = pollSecretHash;
			this.expiresAt = expiresAt;
		}
	}

	private static final Duration TERMINAL_RETENTION = Duration.ofSeconds(90);

	private final Clock clock;
	private final Duration ttl;
	private final int maxActive;
	private final Map<String, Pairing> pairings = new LinkedHashMap<>();

	public PairingService(Clock clock, Duration ttl, int maxActive) {
		this.clock = clock;
		this.ttl = ttl;
		this.maxActive = maxActive;
	}

	public static String newCode() {
		StringBuilder code = new StringBuilder(CODE_LENGTH);
		for (int i = 0; i < CODE_LENGTH; i++) {
			code.append(ALPHABET.charAt(SecureTokens.randomIndex(ALPHABET.length())));
		}
		return code.toString();
	}

	/** Strips separators and spaces; returns empty when the result is not a well-formed code. */
	public static Optional<String> normalizeCode(String input) {
		if (input == null || input.length() > 32) {
			return Optional.empty();
		}
		String code = input.replace("-", "").replace(" ", "").toUpperCase(Locale.ROOT);
		if (code.startsWith("EDEN") && code.length() == CODE_LENGTH + 4) {
			code = code.substring(4);
		}
		if (code.length() != CODE_LENGTH) {
			return Optional.empty();
		}
		for (char c : code.toCharArray()) {
			if (ALPHABET.indexOf(c) < 0) {
				return Optional.empty();
			}
		}
		return Optional.of(code);
	}

	public static String displayCode(String code) {
		return code.substring(0, 4) + "-" + code.substring(4);
	}

	public synchronized Start start() throws PairingException {
		prune();
		long active = pairings.values().stream().filter(p -> isOpen(p.state)).count();
		if (active >= maxActive) {
			throw new PairingException("too_many_pairings");
		}
		String code;
		do {
			code = newCode();
		} while (findByCode(code).isPresent());
		String id = SecureTokens.randomId();
		String pollSecret = SecureTokens.randomSecret(32);
		Instant expiresAt = clock.instant().plus(ttl);
		pairings.put(id, new Pairing(id, code, SecureTokens.sha256(pollSecret), expiresAt));
		return new Start(id, code, pollSecret, ttl.toSeconds());
	}

	private static boolean isOpen(State state) {
		return state == State.PENDING || state == State.CLAIMED || state == State.AWAITING_LAUNCHER;
	}

	private Pairing authorize(String pairingId, String pollSecret) throws PairingException {
		prune();
		Pairing pairing = pairingId == null ? null : pairings.get(pairingId);
		if (pairing == null
				|| pollSecret == null
				|| !SecureTokens.constantTimeEquals(pairing.pollSecretHash, SecureTokens.sha256(pollSecret))) {
			throw new PairingException("invalid_pairing");
		}
		expireIfNeeded(pairing);
		return pairing;
	}

	private void expireIfNeeded(Pairing pairing) {
		if (isOpen(pairing.state) && !clock.instant().isBefore(pairing.expiresAt)) {
			pairing.state = State.EXPIRED;
		}
	}

	private long remaining(Pairing pairing) {
		return Math.max(0, Duration.between(clock.instant(), pairing.expiresAt).toSeconds());
	}

	public synchronized View status(String pairingId, String pollSecret) throws PairingException {
		Pairing pairing = authorize(pairingId, pollSecret);
		PlayerRef shown = pairing.state == State.AWAITING_LAUNCHER || pairing.state == State.CONFIRMED ? pairing.player : null;
		return new View(pairing.state, shown, remaining(pairing));
	}

	private Optional<Pairing> findByCode(String code) {
		byte[] wanted = code.getBytes(StandardCharsets.US_ASCII);
		Pairing found = null;
		for (Pairing pairing : pairings.values()) {
			if (SecureTokens.constantTimeEquals(pairing.code.getBytes(StandardCharsets.US_ASCII), wanted)) {
				found = pairing;
			}
		}
		return Optional.ofNullable(found);
	}

	/**
	 * Binds an open pairing to the authenticated player who typed its code. A player can hold only
	 * one claim at a time; claiming again releases the previous claim. Returns the nonce the player
	 * must confirm.
	 */
	public synchronized String claim(String rawCode, PlayerRef player) throws PairingException {
		prune();
		String code = normalizeCode(rawCode).orElseThrow(() -> new PairingException("unknown_code"));
		Pairing pairing = findByCode(code).orElseThrow(() -> new PairingException("unknown_code"));
		expireIfNeeded(pairing);
		if (pairing.state == State.EXPIRED) {
			throw new PairingException("expired");
		}
		if (pairing.state != State.PENDING) {
			if (pairing.player != null && pairing.player.uuid().equals(player.uuid())) {
				throw new PairingException("already_claimed_by_you");
			}
			throw new PairingException("unknown_code");
		}
		for (Pairing other : pairings.values()) {
			if (other != pairing
					&& isOpen(other.state)
					&& other.player != null
					&& other.player.uuid().equals(player.uuid())) {
				other.state = State.CANCELLED;
			}
		}
		String nonce = SecureTokens.randomSecret(12);
		pairing.state = State.CLAIMED;
		pairing.player = player;
		pairing.confirmNonceHash = SecureTokens.sha256(nonce);
		return nonce;
	}

	private Pairing byNonce(String nonce, PlayerRef player) throws PairingException {
		prune();
		if (nonce == null || nonce.length() > 64) {
			throw new PairingException("unknown_confirmation");
		}
		byte[] hash = SecureTokens.sha256(nonce);
		for (Pairing pairing : pairings.values()) {
			if (pairing.confirmNonceHash != null && SecureTokens.constantTimeEquals(pairing.confirmNonceHash, hash)) {
				expireIfNeeded(pairing);
				if (pairing.state == State.EXPIRED) {
					throw new PairingException("expired");
				}
				if (pairing.state != State.CLAIMED) {
					throw new PairingException("unknown_confirmation");
				}
				if (!pairing.player.uuid().equals(player.uuid())) {
					throw new PairingException("wrong_player");
				}
				return pairing;
			}
		}
		throw new PairingException("unknown_confirmation");
	}

	public synchronized PlayerRef confirmInGame(String nonce, PlayerRef player) throws PairingException {
		Pairing pairing = byNonce(nonce, player);
		pairing.state = State.AWAITING_LAUNCHER;
		pairing.confirmNonceHash = null;
		return pairing.player;
	}

	public synchronized void rejectInGame(String nonce, PlayerRef player) throws PairingException {
		Pairing pairing = byNonce(nonce, player);
		pairing.state = State.REJECTED;
		pairing.confirmNonceHash = null;
	}

	/** Completes a pairing confirmed on both ends and returns the bound player exactly once. */
	public synchronized PlayerRef finalizeLaunch(String pairingId, String pollSecret) throws PairingException {
		Pairing pairing = authorize(pairingId, pollSecret);
		if (pairing.state == State.EXPIRED) {
			throw new PairingException("expired");
		}
		if (pairing.state != State.AWAITING_LAUNCHER) {
			throw new PairingException("not_confirmed");
		}
		pairing.state = State.CONFIRMED;
		return pairing.player;
	}

	public synchronized void cancel(String pairingId, String pollSecret) throws PairingException {
		Pairing pairing = authorize(pairingId, pollSecret);
		if (isOpen(pairing.state)) {
			pairing.state = State.CANCELLED;
		}
	}

	/** Revokes open pairings of a player who disconnected or changed identity. */
	public synchronized void releasePlayer(PlayerRef player) {
		for (Pairing pairing : pairings.values()) {
			if (pairing.player != null
					&& pairing.player.uuid().equals(player.uuid())
					&& (pairing.state == State.CLAIMED)) {
				pairing.state = State.CANCELLED;
				pairing.confirmNonceHash = null;
			}
		}
	}

	private void prune() {
		Instant now = clock.instant();
		Iterator<Pairing> iterator = pairings.values().iterator();
		while (iterator.hasNext()) {
			Pairing pairing = iterator.next();
			if (now.isAfter(pairing.expiresAt.plus(TERMINAL_RETENTION))) {
				iterator.remove();
			}
		}
	}

	public synchronized int size() {
		prune();
		return pairings.size();
	}
}
