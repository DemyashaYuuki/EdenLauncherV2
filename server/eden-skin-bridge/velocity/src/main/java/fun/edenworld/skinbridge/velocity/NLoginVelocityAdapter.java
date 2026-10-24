package fun.edenworld.skinbridge.velocity;

import com.nickuc.login.api.nLoginAPI;
import com.velocitypowered.api.proxy.Player;
import com.velocitypowered.api.proxy.ProxyServer;

/** nLogin running on the proxy; uses {@code nLoginAPI#isAuthenticated}. */
final class NLoginVelocityAdapter implements ProxyAuthAdapter {
	private final ProxyServer proxy;

	NLoginVelocityAdapter(ProxyServer proxy) {
		this.proxy = proxy;
	}

	@Override
	public String name() {
		return "nlogin-velocity";
	}

	@Override
	public String unavailableReason() {
		if (proxy.getPluginManager().getPlugin("nlogin").isEmpty()) {
			return "nLogin is not installed on this proxy";
		}
		try {
			return nLoginAPI.getApi().isAvailable() ? null : "nLogin is not ready";
		} catch (RuntimeException | LinkageError e) {
			return "nLogin API unavailable";
		}
	}

	@Override
	public boolean isAuthenticated(Player player) {
		if (!player.isActive() || unavailableReason() != null) {
			return false;
		}
		try {
			return nLoginAPI.getApi().isAuthenticated(player.getUsername());
		} catch (RuntimeException | LinkageError e) {
			return false;
		}
	}
}
