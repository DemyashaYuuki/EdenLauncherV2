package fun.edenworld.skinbridge.paper;

import com.nickuc.login.api.event.bukkit.auth.AuthenticateEvent;
import com.nickuc.login.api.event.bukkit.twofactor.TwoFactorAuthEvent;
import com.nickuc.login.api.event.bukkit.twofactor.TwoFactorRequestEvent;
import com.nickuc.login.api.nLoginAPI;
import fun.edenworld.skinbridge.core.AuthGate;
import fun.edenworld.skinbridge.core.PlayerRef;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.Plugin;

/**
 * Current season: nLogin on this server (native or through its proxy implementation). A player
 * counts as authenticated only when {@code nLoginAPI#isAuthenticated} says so and no second-factor
 * request seen on this connection is still unanswered.
 */
final class NLoginGate implements AuthGate, Listener {
	private final Plugin plugin;
	private final Set<UUID> twoFactorPending = ConcurrentHashMap.newKeySet();

	NLoginGate(Plugin plugin) {
		this.plugin = plugin;
	}

	@Override
	public String adapterName() {
		return "nlogin";
	}

	@Override
	public Readiness readiness() {
		Plugin nlogin = Bukkit.getPluginManager().getPlugin("nLogin");
		if (nlogin == null || !nlogin.isEnabled()) {
			return Readiness.notReady("nLogin is not installed or not enabled");
		}
		try {
			if (!nLoginAPI.getApi().isAvailable()) {
				return Readiness.notReady("nLogin is not ready yet");
			}
			return Readiness.ok();
		} catch (RuntimeException | LinkageError e) {
			return Readiness.notReady("nLogin API unavailable: " + e.getClass().getSimpleName());
		}
	}

	@Override
	public CompletableFuture<AuthDecision> verify(PlayerRef ref) {
		CompletableFuture<AuthDecision> result = new CompletableFuture<>();
		Bukkit.getScheduler().runTask(plugin, () -> {
			try {
				result.complete(check(ref));
			} catch (RuntimeException | LinkageError e) {
				result.complete(AuthDecision.denied("nlogin_error"));
			}
		});
		return result;
	}

	private AuthDecision check(PlayerRef ref) {
		if (!readiness().ready()) {
			return AuthDecision.denied("nlogin_unavailable");
		}
		Player player = Bukkit.getPlayer(ref.uuid());
		if (player == null || !player.isOnline()) {
			return AuthDecision.denied("offline");
		}
		if (!player.getName().equals(ref.name())) {
			return AuthDecision.denied("identity_changed");
		}
		if (twoFactorPending.contains(ref.uuid())) {
			return AuthDecision.denied("two_factor_pending");
		}
		return nLoginAPI.getApi().isAuthenticated(player.getName())
				? AuthDecision.allowed()
				: AuthDecision.denied("not_authenticated");
	}

	@EventHandler(priority = EventPriority.MONITOR)
	public void onTwoFactorRequest(TwoFactorRequestEvent event) {
		twoFactorPending.add(event.getPlayer().getUniqueId());
	}

	@EventHandler(priority = EventPriority.MONITOR)
	public void onTwoFactorAuth(TwoFactorAuthEvent event) {
		twoFactorPending.remove(event.getPlayer().getUniqueId());
	}

	@EventHandler(priority = EventPriority.MONITOR)
	public void onAuthenticate(AuthenticateEvent event) {
		twoFactorPending.remove(event.getPlayer().getUniqueId());
	}

	@EventHandler(priority = EventPriority.MONITOR)
	public void onQuit(PlayerQuitEvent event) {
		twoFactorPending.remove(event.getPlayer().getUniqueId());
	}
}
