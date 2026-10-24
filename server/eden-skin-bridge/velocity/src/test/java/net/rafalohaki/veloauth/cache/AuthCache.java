package net.rafalohaki.veloauth.cache;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Test double mirroring the inspected semantics: authorized entry bound to an IP, plus a session. */
public class AuthCache {
	public final Map<UUID, String> authorized = new HashMap<>();
	public final Set<String> sessions = new HashSet<>();

	public boolean isPlayerAuthorized(UUID uuid, String ip) {
		return ip != null && ip.equals(authorized.get(uuid));
	}

	public boolean hasActiveSession(UUID uuid, String name, String ip) {
		return sessions.contains(uuid + "|" + name + "|" + ip);
	}

	public void login(UUID uuid, String name, String ip) {
		authorized.put(uuid, ip);
		sessions.add(uuid + "|" + name + "|" + ip);
	}

	public void logout(UUID uuid) {
		authorized.remove(uuid);
		sessions.removeIf(s -> s.startsWith(uuid + "|"));
	}
}
