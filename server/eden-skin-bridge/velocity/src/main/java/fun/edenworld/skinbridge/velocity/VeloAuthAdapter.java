package fun.edenworld.skinbridge.velocity;

import com.velocitypowered.api.plugin.PluginContainer;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;
import java.lang.reflect.Method;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;

/**
 * Reads VeloAuth's own authorization state through its public API, resolved by reflection so the
 * user's VeloAuth JAR is never bundled or compiled against.
 *
 * <p>Inspected bytecode of VeloAuth 1.6.2-offline.2 (sha256
 * 6384460ebb373b646c4fee196184cb412610c0407a70eb75c5aec82f937bd8cd): VeloAuth itself treats an
 * offline player as allowed to reach backends when {@code AuthCache.isPlayerAuthorized(uuid, ip)}
 * (an authorized-cache entry whose IP matches) and {@code AuthCache.hasActiveSession(uuid, name, ip)}
 * are both true, with the IP taken from {@code PlayerAddressUtils.getPlayerIp(player)}. Logins with
 * TOTP enabled are parked in {@code PendingTotpStore} and only authorized after the code; premium
 * logins are authorized after Mojang verification. Disconnects remove the cache entry and session.
 * This adapter requires all of that plus an active connection, and denies on any mismatch, unknown
 * version or reflection failure. It never calls authorize, addAuthorizedPlayer or forceLogin and
 * never reads password data.
 */
final class VeloAuthAdapter implements ProxyAuthAdapter {
	static final String MAIN_CLASS = "net.rafalohaki.veloauth.VeloAuth";
	static final String CACHE_CLASS = "net.rafalohaki.veloauth.cache.AuthCache";
	static final String ADDRESS_CLASS = "net.rafalohaki.veloauth.util.PlayerAddressUtils";
	static final String TOTP_STORE_CLASS = "net.rafalohaki.veloauth.auth.totp.PendingTotpStore";

	private record Handles(
			Object plugin,
			Method isInitialized,
			Method getAuthCache,
			Method isPlayerAuthorized,
			Method hasActiveSession,
			Method getPlayerIp,
			Method getPendingTotpStore,
			Method pendingGet) {}

	private final ProxyServer proxy;
	private final Set<String> supportedVersions;
	private final Logger logger;
	private volatile String lastProblem;

	VeloAuthAdapter(ProxyServer proxy, Set<String> supportedVersions, Logger logger) {
		this.proxy = proxy;
		this.supportedVersions = supportedVersions;
		this.logger = logger;
	}

	@Override
	public String name() {
		return "veloauth";
	}

	private void problem(String message) {
		if (!message.equals(lastProblem)) {
			lastProblem = message;
			logger.warn("VeloAuth adapter unavailable: {}", message);
		}
	}

	private Handles resolve() {
		Optional<PluginContainer> container = proxy.getPluginManager().getPlugin("veloauth");
		if (container.isEmpty()) {
			problem("VeloAuth is not installed");
			return null;
		}
		String version = container.get().getDescription().getVersion().orElse("");
		if (!supportedVersions.contains(version)) {
			problem("VeloAuth version " + version + " is not in veloauth-supported-versions");
			return null;
		}
		Object plugin = container.get().getInstance().orElse(null);
		if (plugin == null || !plugin.getClass().getName().equals(MAIN_CLASS)) {
			problem("VeloAuth instance is missing or has an unexpected class");
			return null;
		}
		ClassLoader loader = plugin.getClass().getClassLoader();
		try {
			Class<?> main = plugin.getClass();
			Class<?> cache = Class.forName(CACHE_CLASS, false, loader);
			Class<?> address = Class.forName(ADDRESS_CLASS, false, loader);
			Class<?> totp = Class.forName(TOTP_STORE_CLASS, false, loader);
			Method getAuthCache = main.getMethod("getAuthCache");
			Method getPendingTotpStore = main.getMethod("getPendingTotpStore");
			Method isPlayerAuthorized = cache.getMethod("isPlayerAuthorized", UUID.class, String.class);
			Method hasActiveSession = cache.getMethod("hasActiveSession", UUID.class, String.class, String.class);
			Method getPlayerIp = address.getMethod("getPlayerIp", Player.class);
			Method pendingGet = totp.getMethod("get", UUID.class);
			if (getAuthCache.getReturnType() != cache
					|| getPendingTotpStore.getReturnType() != totp
					|| isPlayerAuthorized.getReturnType() != boolean.class
					|| hasActiveSession.getReturnType() != boolean.class
					|| getPlayerIp.getReturnType() != String.class
					|| pendingGet.getReturnType() != Optional.class) {
				problem("VeloAuth API signatures changed");
				return null;
			}
			lastProblem = null;
			return new Handles(
					plugin,
					main.getMethod("isInitialized"),
					getAuthCache,
					isPlayerAuthorized,
					hasActiveSession,
					getPlayerIp,
					getPendingTotpStore,
					pendingGet);
		} catch (ReflectiveOperationException | LinkageError e) {
			problem("VeloAuth API not found: " + e.getClass().getSimpleName());
			return null;
		}
	}

	@Override
	public String unavailableReason() {
		Handles handles = resolve();
		if (handles == null) {
			return lastProblem == null ? "VeloAuth unavailable" : lastProblem;
		}
		try {
			return Boolean.TRUE.equals(handles.isInitialized().invoke(handles.plugin())) ? null : "VeloAuth is still initializing";
		} catch (ReflectiveOperationException | RuntimeException e) {
			return "VeloAuth state unreadable";
		}
	}

	@Override
	public boolean isAuthenticated(Player player) {
		if (!player.isActive()) {
			return false;
		}
		Handles handles = resolve();
		if (handles == null) {
			return false;
		}
		try {
			if (!Boolean.TRUE.equals(handles.isInitialized().invoke(handles.plugin()))) {
				return false;
			}
			Object cache = handles.getAuthCache().invoke(handles.plugin());
			Object store = handles.getPendingTotpStore().invoke(handles.plugin());
			if (cache == null || store == null) {
				return false;
			}
			Object ip = handles.getPlayerIp().invoke(null, player);
			if (!(ip instanceof String address) || address.isBlank() || address.equals("unknown")) {
				return false;
			}
			UUID uuid = player.getUniqueId();
			boolean authorized = Boolean.TRUE.equals(handles.isPlayerAuthorized().invoke(cache, uuid, address));
			boolean session = Boolean.TRUE.equals(handles.hasActiveSession().invoke(cache, uuid, player.getUsername(), address));
			Object pending = handles.pendingGet().invoke(store, uuid);
			boolean totpPending = !(pending instanceof Optional<?> optional) || optional.isPresent();
			return authorized && session && !totpPending;
		} catch (ReflectiveOperationException | RuntimeException e) {
			problem("VeloAuth call failed: " + e.getClass().getSimpleName());
			return false;
		}
	}
}
