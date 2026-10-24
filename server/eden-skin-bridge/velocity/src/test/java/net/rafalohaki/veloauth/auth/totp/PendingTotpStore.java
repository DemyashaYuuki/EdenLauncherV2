package net.rafalohaki.veloauth.auth.totp;

import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public final class PendingTotpStore {
	public final Set<UUID> pending = new HashSet<>();

	public Optional<Object> get(UUID uuid) {
		return pending.contains(uuid) ? Optional.of(new Object()) : Optional.empty();
	}
}
