package fun.edenworld.skinbridge.velocity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.velocitypowered.api.plugin.PluginContainer;
import com.velocitypowered.api.plugin.PluginDescription;
import com.velocitypowered.api.plugin.PluginManager;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import net.rafalohaki.veloauth.VeloAuth;
import org.junit.jupiter.api.Test;
import org.slf4j.helpers.NOPLogger;

class VeloAuthAdapterTest {
	private final VeloAuth veloAuth = new VeloAuth();
	private final UUID uuid = UUID.randomUUID();
	private boolean active = true;
	private String version = "1.6.2-offline.2";
	private Object instance = veloAuth;

	@SuppressWarnings("unchecked")
	private static <T> T proxy(Class<T> type, InvocationHandler handler) {
		return (T) Proxy.newProxyInstance(VeloAuthAdapterTest.class.getClassLoader(), new Class<?>[] {type}, handler);
	}

	private ProxyServer server(boolean installed) {
		PluginDescription description = proxy(PluginDescription.class, (p, m, a) -> switch (m.getName()) {
			case "getVersion" -> Optional.of(version);
			case "getId" -> "veloauth";
			default -> null;
		});
		PluginContainer container = proxy(PluginContainer.class, (p, m, a) -> switch (m.getName()) {
			case "getDescription" -> description;
			case "getInstance" -> Optional.ofNullable(instance);
			default -> null;
		});
		PluginManager manager = proxy(PluginManager.class, (p, m, a) -> switch (m.getName()) {
			case "getPlugin" -> installed && "veloauth".equals(a[0]) ? Optional.of(container) : Optional.empty();
			case "isLoaded" -> installed;
			default -> null;
		});
		return proxy(ProxyServer.class, (p, m, a) -> m.getName().equals("getPluginManager") ? manager : null);
	}

	private Player player(String ip) {
		return proxy(Player.class, (p, m, a) -> switch (m.getName()) {
			case "getUniqueId" -> uuid;
			case "getUsername" -> "Steve";
			case "isActive" -> active;
			case "getRemoteAddress" -> ip == null ? null : new InetSocketAddress(ip, 25565);
			case "hashCode" -> 1;
			case "equals" -> p == a[0];
			default -> null;
		});
	}

	private VeloAuthAdapter adapter(boolean installed) {
		return new VeloAuthAdapter(server(installed), Set.of("1.6.2-offline.2"), NOPLogger.NOP_LOGGER);
	}

	@Test
	void authenticatedPlayerWithMatchingSessionIsAccepted() {
		veloAuth.cache.login(uuid, "Steve", "203.0.113.5");
		VeloAuthAdapter adapter = adapter(true);
		assertNull(adapter.unavailableReason());
		assertTrue(adapter.isAuthenticated(player("203.0.113.5")));
	}

	@Test
	void preLoginPlayerIsDenied() {
		assertFalse(adapter(true).isAuthenticated(player("203.0.113.5")));
	}

	@Test
	void sessionFromAnotherAddressIsDenied() {
		veloAuth.cache.login(uuid, "Steve", "203.0.113.5");
		assertFalse(adapter(true).isAuthenticated(player("198.51.100.7")));
	}

	@Test
	void postLogoutAndDisconnectAreDenied() {
		veloAuth.cache.login(uuid, "Steve", "203.0.113.5");
		VeloAuthAdapter adapter = adapter(true);
		veloAuth.cache.logout(uuid);
		assertFalse(adapter.isAuthenticated(player("203.0.113.5")));
		veloAuth.cache.login(uuid, "Steve", "203.0.113.5");
		active = false;
		assertFalse(adapter.isAuthenticated(player("203.0.113.5")));
	}

	@Test
	void pendingSecondFactorIsDenied() {
		veloAuth.cache.login(uuid, "Steve", "203.0.113.5");
		veloAuth.pending.pending.add(uuid);
		assertFalse(adapter(true).isAuthenticated(player("203.0.113.5")));
	}

	@Test
	void authorizationWithoutSessionIsDenied() {
		veloAuth.cache.authorized.put(uuid, "203.0.113.5");
		assertFalse(adapter(true).isAuthenticated(player("203.0.113.5")));
	}

	@Test
	void failsClosedForMissingPluginUnknownVersionUninitializedOrWrongClass() {
		veloAuth.cache.login(uuid, "Steve", "203.0.113.5");
		assertNotNull(adapter(false).unavailableReason());
		assertFalse(adapter(false).isAuthenticated(player("203.0.113.5")));

		version = "1.6.3";
		assertFalse(adapter(true).isAuthenticated(player("203.0.113.5")));
		assertTrue(adapter(true).unavailableReason().contains("1.6.3"));

		version = "1.6.2-offline.2";
		veloAuth.initialized = false;
		assertEquals("VeloAuth is still initializing", adapter(true).unavailableReason());
		assertFalse(adapter(true).isAuthenticated(player("203.0.113.5")));

		veloAuth.initialized = true;
		instance = new Object();
		assertFalse(adapter(true).isAuthenticated(player("203.0.113.5")));
	}

	@Test
	void unknownAddressIsDenied() {
		veloAuth.cache.login(uuid, "Steve", "unknown");
		assertFalse(adapter(true).isAuthenticated(player(null)));
	}
}
