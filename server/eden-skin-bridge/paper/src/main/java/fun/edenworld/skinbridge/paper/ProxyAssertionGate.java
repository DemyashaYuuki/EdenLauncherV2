package fun.edenworld.skinbridge.paper;

import fun.edenworld.skinbridge.core.AuthAssertion;
import fun.edenworld.skinbridge.core.AuthGate;
import fun.edenworld.skinbridge.core.PlayerRef;
import fun.edenworld.skinbridge.core.ProxyAuthVerifier;
import java.util.concurrent.CompletableFuture;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.messaging.PluginMessageListener;

/**
 * Next season: authentication lives on the Velocity proxy (VeloAuth). The backend asks the
 * EdenSkinBridge Velocity companion through the player's connection and accepts only replies that
 * are signed with the shared secret, fresh, bound to the query nonce, this player and this server.
 */
final class ProxyAssertionGate implements AuthGate, PluginMessageListener {
	private final Plugin plugin;
	private final ProxyAuthVerifier verifier;
	private final ForwardingCheck.Result forwarding;

	ProxyAssertionGate(Plugin plugin, ProxyAuthVerifier verifier, ForwardingCheck.Result forwarding) {
		this.plugin = plugin;
		this.verifier = verifier;
		this.forwarding = forwarding;
	}

	@Override
	public String adapterName() {
		return "velocity-proxy";
	}

	@Override
	public Readiness readiness() {
		if (!verifier.configured()) {
			return Readiness.notReady("proxy.shared-secret (32+ bytes, base64) and proxy.server-name must be set");
		}
		if (!forwarding.trusted()) {
			return Readiness.notReady(forwarding.detail());
		}
		return Readiness.ok();
	}

	@Override
	public CompletableFuture<AuthDecision> verify(PlayerRef ref) {
		if (!readiness().ready()) {
			return CompletableFuture.completedFuture(AuthDecision.denied("proxy_not_configured"));
		}
		CompletableFuture<AuthDecision> result = new CompletableFuture<>();
		Bukkit.getScheduler().runTask(plugin, () -> {
			Player player = Bukkit.getPlayer(ref.uuid());
			if (player == null || !player.isOnline() || !player.getName().equals(ref.name())) {
				result.complete(AuthDecision.denied("offline"));
				return;
			}
			verifier.request(ref, bytes -> player.sendPluginMessage(plugin, AuthAssertion.CHANNEL, bytes))
					.whenComplete((decision, error) -> result.complete(error == null ? decision : AuthDecision.denied("proxy_error")));
		});
		return result;
	}

	@Override
	public void onPluginMessageReceived(String channel, Player player, byte[] message) {
		if (!AuthAssertion.CHANNEL.equals(channel)) {
			return;
		}
		verifier.onReply(new PlayerRef(player.getUniqueId(), player.getName()), message);
	}
}
