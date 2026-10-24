package fun.edenworld.skinbridge.core;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonParseException;
import com.google.gson.reflect.TypeToken;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Launcher links issued after pairing. Only SHA-256 hashes of bearer tokens are stored. Each token
 * is bound to one server player UUID; idle tokens expire and a player can revoke all of theirs.
 */
public final class TokenStore {
	public record Link(String tokenHash, UUID player, String name, long createdMs, long lastUsedMs) {}

	public record Issued(String token, Link link) {}

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	private final Path file;
	private final Clock clock;
	private final int maxPerPlayer;
	private final Duration idleExpiry;
	private final Map<String, Link> links = new HashMap<>();

	public TokenStore(Path file, Clock clock, int maxPerPlayer, Duration idleExpiry) throws IOException {
		this.file = file;
		this.clock = clock;
		this.maxPerPlayer = maxPerPlayer;
		this.idleExpiry = idleExpiry;
		load();
	}

	private void load() throws IOException {
		if (file == null || !Files.exists(file)) {
			return;
		}
		String json = Files.readString(file, StandardCharsets.UTF_8);
		try {
			List<Link> stored = GSON.fromJson(json, new TypeToken<List<Link>>() {}.getType());
			if (stored != null) {
				for (Link link : stored) {
					if (link != null && link.tokenHash() != null && link.tokenHash().length() == 64 && link.player() != null) {
						links.put(link.tokenHash(), link);
					}
				}
			}
		} catch (JsonParseException e) {
			throw new IOException("Corrupt link store " + file, e);
		}
	}

	private void save() {
		if (file == null) {
			return;
		}
		try {
			Files.createDirectories(file.getParent());
			Path temp = Files.createTempFile(file.getParent(), "links", ".tmp");
			Files.writeString(temp, GSON.toJson(new ArrayList<>(links.values())), StandardCharsets.UTF_8);
			try {
				Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
			} catch (AtomicMoveNotSupportedException e) {
				Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
			}
		} catch (IOException e) {
			throw new IllegalStateException("Could not save link store", e);
		}
	}

	/** Issues a new token for the player, dropping their oldest links beyond the per-player limit. */
	public synchronized Issued issue(PlayerRef player) {
		pruneExpired();
		String token = SecureTokens.randomSecret(32);
		long now = clock.millis();
		Link link = new Link(SecureTokens.sha256Hex(token), player.uuid(), player.name(), now, now);
		links.put(link.tokenHash(), link);
		List<Link> older = links.values().stream()
				.filter(l -> l.player().equals(player.uuid()) && !l.tokenHash().equals(link.tokenHash()))
				.sorted(Comparator.comparingLong(Link::lastUsedMs).thenComparingLong(Link::createdMs))
				.toList();
		for (int i = 0; i < older.size() - (maxPerPlayer - 1); i++) {
			links.remove(older.get(i).tokenHash());
		}
		save();
		return new Issued(token, link);
	}

	/** Resolves a bearer token, refreshing its idle timer. */
	public synchronized Optional<Link> authenticate(String token) {
		if (token == null || token.length() < 32 || token.length() > 512) {
			return Optional.empty();
		}
		pruneExpired();
		String hash = SecureTokens.sha256Hex(token);
		Link link = links.get(hash);
		if (link == null) {
			return Optional.empty();
		}
		long now = clock.millis();
		if (now - link.lastUsedMs() > 60_000) {
			Link touched = new Link(link.tokenHash(), link.player(), link.name(), link.createdMs(), now);
			links.put(hash, touched);
			save();
			return Optional.of(touched);
		}
		return Optional.of(link);
	}

	public synchronized boolean revoke(String token) {
		boolean removed = links.remove(SecureTokens.sha256Hex(token)) != null;
		if (removed) {
			save();
		}
		return removed;
	}

	public synchronized int revokeAll(UUID player) {
		int before = links.size();
		links.values().removeIf(l -> l.player().equals(player));
		int removed = before - links.size();
		if (removed > 0) {
			save();
		}
		return removed;
	}

	public synchronized int count(UUID player) {
		return (int) links.values().stream().filter(l -> l.player().equals(player)).count();
	}

	private void pruneExpired() {
		long cutoff = clock.millis() - idleExpiry.toMillis();
		if (links.values().removeIf(l -> l.lastUsedMs() < cutoff)) {
			save();
		}
	}
}
